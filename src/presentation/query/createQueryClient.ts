import { QueryCache, QueryClient } from '@tanstack/react-query';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';

import type { MeetingsErrorCode } from '../i18n/translationKeys';

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
const SESSION_ENDING_CODES: ReadonlySet<MeetingsErrorCode> = new Set([
  REPOSITORY_ERROR_CODE.Unauthorized,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.AppLocked,
]);

export function isSessionEndingCode(code: MeetingsErrorCode): boolean {
  return SESSION_ENDING_CODES.has(code);
}

export interface QueryClientOptions {
  /** The wait before a retry. A test gives a function that answers zero. */
  readonly retryDelay?: (failureCount: number) => number;
  /**
   * Told why, before the cache is emptied, when a failure ends the session. The app uses it to
   * show that the session is over (see `AppProviders`): once the cache is empty a screen would
   * ask again, which the answer would end again.
   */
  readonly onSessionEnded?: (code: MeetingsErrorCode) => void;
}

/**
 * Empties the cache: everything the previous session of the user left in memory. It is what a
 * sign-out calls (step 4), and what a failure that ends the session triggers by itself. A screen
 * that still shows data when it is called does not notice, since nothing tells it: the screens
 * that show the data of a user must be left first, which is what the sign-out and
 * `onSessionEnded` do.
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
 * - a failure that ends the session empties the whole cache from here, whichever query it came
 *   from, so that nothing of the previous session stays in memory.
 */
export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        if (!isQueryFailure(error)) return;
        const code = errorCodeOf(error);
        if (!isSessionEndingCode(code)) return;
        options.onSessionEnded?.(code);
        // Once the failing query has finished with its own error: it schedules its collection
        // after this handler, which would put back a timer on a query that is no longer there.
        void Promise.resolve().then(() => {
          discardSessionData(client);
        });
      },
    }),
    defaultOptions: {
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
