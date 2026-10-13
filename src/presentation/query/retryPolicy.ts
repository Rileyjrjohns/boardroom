import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';

import { errorCodeOf } from './errorCode';

/** How many times a failed query is tried again before it is reported. */
export const MAX_QUERY_RETRIES = 2;

/** The first wait before a retry, doubled each time, in milliseconds. */
const RETRY_BASE_DELAY_MILLIS = 500;
const RETRY_MAX_DELAY_MILLIS = 4000;

/**
 * The errors that a second try can fix: the network may be back, a server fault may have passed, a
 * store may be readable again. Every other code says something that asking again will not change:
 * the session is gone or refused (`unauthorized`, `notAuthenticated`, `sessionExpired`), the app
 * is locked until the user unlocks it (`appLocked`), somebody else is signed in now
 * (`sessionChanged`), the item is refused to the user or does not exist (`forbidden`, `notFound`),
 * the request itself is wrong (`validation`).
 */
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
]);

export function isRetryableCode(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}

/**
 * Whether the query client tries a failed query again. It depends on the error code: a code that a
 * retry cannot fix is reported at once. A rejection that is not the failure of a use case is read
 * as `unexpected` (see `errorCodeOf`), which is retried like a server fault.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  return isRetryableCode(errorCodeOf(error));
}

/** Exponential backoff: 0.5 s, then 1 s, up to 4 s. */
export function retryDelay(failureCount: number): number {
  return Math.min(RETRY_BASE_DELAY_MILLIS * 2 ** failureCount, RETRY_MAX_DELAY_MILLIS);
}
