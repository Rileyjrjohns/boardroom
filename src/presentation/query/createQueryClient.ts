import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';

import { errorCodeOf } from './errorCode';
import { isQueryFailure } from './QueryFailure';
import { retryDelay, shouldRetry } from './retryPolicy';

/**
 * How long what a query holds counts as current, in milliseconds. A screen opened again inside this
 * window (back from a meeting, the other period of the list and back) shows what it has and asks
 * the server nothing; after it, the screen shows what it has at once and revalidates in the
 * background. The reasons:
 *
 * - the offline policy (the saved copy, how old it may be) is the business of the use cases and
 *   their cache on the device, not of this one. This cache only avoids asking again for what was
 *   just asked, so a short window is enough;
 * - revalidating a list that is several pages long asks for every page loaded, one after the other
 *   (a pull to refresh starts again from the first page instead, see `useMeetingsList`), which is
 *   not worth doing at every return to the screen;
 * - the data is what a board agenda says: a minute old is fine to look at, and the user can pull
 *   to refresh for more.
 */
export const QUERY_STALE_TIME_MILLIS = 60_000;

/**
 * How long a query that no screen shows any more stays in memory, in milliseconds. The data is
 * confidential, so it must not linger: five minutes cover going back and forth between a list and
 * a meeting, and the meeting left after that is dropped from memory. The data on the device is
 * the business of the application layer, and is emptied by its own rules.
 */
export const QUERY_GC_TIME_MILLIS = 300_000;

/**
 * The failures that say the session of the user is over, whatever the screen was doing: the server
 * refused the session, there is none, it has expired or is another one, or the app is locked. They
 * end the session for every screen, and the cache is emptied (see `createQueryClient`).
 */
const SESSION_ENDING_CODES = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.AppLocked,
] as const;

export type SessionEndingCode = (typeof SESSION_ENDING_CODES)[number];

/**
 * The failures that say the user may not have this item, or that it is not there: the screen of
 * the item stops showing it, and so does the memory (see `forgetRefusedItem`).
 */
const ITEM_REFUSAL_CODES: ReadonlySet<string> = new Set([
  REPOSITORY_ERROR_CODE.Forbidden,
  REPOSITORY_ERROR_CODE.NotFound,
]);

/**
 * A refusal of one item (`forbidden`, `notFound`) means that what this query held is not the
 * user's to see any more: a meeting they lost access to, or that was removed. A failed refetch
 * keeps the data of the last success next to its error, which is right for a connection that
 * dropped and wrong here, since the screen hides the item and the memory would still hold it. The
 * data is dropped from the query, which keeps its error. (The copy on the device is the business
 * of the application layer, which removes it when it meets the same refusal.)
 */
function forgetRefusedItem(error: unknown, query: Query<unknown, unknown, unknown>): void {
  if (!isQueryFailure(error) || !ITEM_REFUSAL_CODES.has(errorCodeOf(error))) return;
  query.setState({ data: undefined, dataUpdatedAt: 0 });
}

const SESSION_ENDING_SET: ReadonlySet<string> = new Set(SESSION_ENDING_CODES);

/** Any code, not only those of the meetings: a synchronisation and an action meet them too. */
export function isSessionEndingCode(code: string): code is SessionEndingCode {
  return SESSION_ENDING_SET.has(code);
}

export interface QueryClientOptions {
  /** The wait before a retry. A test gives a function that answers zero. */
  readonly retryDelay?: (failureCount: number) => number;
  /**
   * Told why, before the cache is emptied, when a failure ends the session, whether a query or a
   * mutation met it, and which access the failing action started under when it said (a mutation
   * does, see `QueryFailure`; a query removed from the cache when the access changed never gets
   * here). The app uses it to send the user to the sign-in or the lock screen (see
   * `createAppState`): once the cache is empty a screen would ask again, which the answer would
   * end again.
   */
  readonly onSessionEnded?: (code: SessionEndingCode, startedUnder: number | undefined) => void;
}

/**
 * Empties the cache, the queries and the mutations: everything the previous session of the user
 * left in memory. A sign-out, a lock and a failure that ends the session all trigger it (see
 * `createAppState`). A screen that still shows data when it is called does not notice, since
 * nothing tells it: the screens that show the data of a user must be left first, which the
 * navigator does by removing them when the user leaves the open app.
 */
export function discardSessionData(client: QueryClient): void {
  client.clear();
}

/**
 * A query client for one app instance. It is created by `AppProviders` and held by it, never a
 * module-level instance, so two apps (or two tests) never share a cache.
 *
 * Server state is a cache of what the use cases returned: the offline policy and the persistent
 * copy are the business of the application layer, not of this client. The defaults say so:
 *
 * - queries are retried according to the error code (see `shouldRetry`);
 * - the data is current for `QUERY_STALE_TIME_MILLIS` and kept for `QUERY_GC_TIME_MILLIS` once
 *   unused (see their notes);
 * - there is no focus or reconnection refetch: React Native has neither window focus nor a network
 *   state in this app, and the screens refresh on demand (pull to refresh, "Try again");
 * - `networkMode: 'always'` runs every query, because whether the server is reachable is for the
 *   adapters to say, with a `networkUnavailable` error, and not for the library to guess;
 * - a failure that ends the session empties the whole cache from here, whichever query or
 *   mutation it came from, so that nothing of the previous session stays in memory;
 * - a query that fails because the item is refused or gone (`forbidden`, `notFound`) loses its
 *   data, while any other failure keeps the data of the last success next to its error;
 * - mutations are never retried (see `useResultMutation`): they act (sign in, vote, acknowledge),
 *   and doing it again is for the user to decide. Nothing reads the result of a mutation once its
 *   screen is gone, and it may hold the choice of a vote, so it is dropped from memory as soon as
 *   nothing observes it (`gcTime: 0`) instead of lingering for five minutes.
 */
export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const endSession = (error: unknown): void => {
    if (!isQueryFailure(error)) return;
    const code = errorCodeOf(error);
    if (!isSessionEndingCode(code)) return;
    options.onSessionEnded?.(code, error.startedUnder);
    // Once the failing query has finished with its own error: it schedules its collection
    // after this handler, which would put back a timer on a query that is no longer there.
    void Promise.resolve().then(() => {
      discardSessionData(client);
    });
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        forgetRefusedItem(error, query);
        endSession(error);
      },
    }),
    mutationCache: new MutationCache({ onError: endSession }),
    defaultOptions: {
      mutations: {
        retry: false,
        networkMode: 'always',
        gcTime: 0,
      },
      queries: {
        retry: shouldRetry,
        retryDelay: options.retryDelay ?? retryDelay,
        staleTime: QUERY_STALE_TIME_MILLIS,
        gcTime: QUERY_GC_TIME_MILLIS,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        networkMode: 'always',
      },
    },
  });
  return client;
}
