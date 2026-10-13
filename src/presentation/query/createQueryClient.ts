import { QueryClient } from '@tanstack/react-query';

import { retryDelay, shouldRetry } from './retryPolicy';

export interface QueryClientOptions {
  /** The wait before a retry. A test gives a function that answers zero. */
  readonly retryDelay?: (failureCount: number) => number;
  /** How long an unused query is kept, in milliseconds. A test gives `Infinity`, which sets no timer. */
  readonly gcTime?: number;
}

/**
 * A query client for one app instance. It is created by `AppProviders` and held by it, never a
 * module-level instance, so two apps (or two tests) never share a cache.
 *
 * Server state is a cache of what the use cases returned: the offline policy and the persistent
 * copy are the business of the application layer, not of this client. The defaults say so:
 *
 * - queries are retried according to the error code (see `shouldRetry`);
 * - there is no focus or reconnection refetch: React Native has neither window focus nor a network
 *   state in this app, and the screens refresh on demand (pull to refresh, "Try again");
 * - `networkMode: 'always'` runs every query, because whether the server is reachable is for the
 *   adapters to say, with a `networkUnavailable` error, and not for the library to guess.
 */
export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay: options.retryDelay ?? retryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        networkMode: 'always',
        ...(options.gcTime === undefined ? {} : { gcTime: options.gcTime }),
      },
    },
  });
}
