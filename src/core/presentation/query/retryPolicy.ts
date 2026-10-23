import { isRetryableCode } from '@core/application/retryableCodes';

import { errorCodeOf } from './errorCode';

/** How many times a failed query is tried again before it is reported. */
export const MAX_QUERY_RETRIES = 2;

/** The first wait before a retry, doubled each time, in milliseconds. */
const RETRY_BASE_DELAY_MILLIS = 500;
const RETRY_MAX_DELAY_MILLIS = 4000;

/**
 * Whether the query client tries a failed query again. It depends on the error code: a code that a
 * retry cannot fix is reported at once (which codes they are is for the application to say, see
 * `isRetryableCode`). A rejection that is not the failure of a use case is read as `unexpected`
 * (see `errorCodeOf`), which is retried like a server fault.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  return isRetryableCode(errorCodeOf(error));
}

/** Exponential backoff: 0.5 s, then 1 s, up to 4 s. */
export function retryDelay(failureCount: number): number {
  return Math.min(RETRY_BASE_DELAY_MILLIS * 2 ** failureCount, RETRY_MAX_DELAY_MILLIS);
}
