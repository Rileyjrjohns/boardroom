import { ERROR_CATALOG } from '@composition/shell/errorCatalog';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';

import { QueryFailure } from './QueryFailure';
import { MAX_QUERY_RETRIES, retryDelay, shouldRetry as shouldRetryWith } from './retryPolicy';

/** The policy of the app: the catalog of the composition says which codes a retry can fix. */
const shouldRetry = (failureCount: number, error: unknown): boolean =>
  shouldRetryWith(failureCount, error, ERROR_CATALOG);

const RETRYABLE = [
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
];
const NOT_RETRYABLE = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  REPOSITORY_ERROR_CODE.Forbidden,
  REPOSITORY_ERROR_CODE.NotFound,
  VALIDATION_ERROR_CODE.Validation,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.AppLocked,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
];

describe('the retry policy', () => {
  it.each(RETRYABLE)('tries %s again, up to the maximum', (code) => {
    const failure = new QueryFailure({ code });

    for (let failures = 0; failures < MAX_QUERY_RETRIES; failures += 1) {
      expect(shouldRetry(failures, failure)).toBe(true);
    }
    expect(shouldRetry(MAX_QUERY_RETRIES, failure)).toBe(false);
  });

  it.each(NOT_RETRYABLE)('never tries %s again: asking again cannot change it', (code) => {
    expect(shouldRetry(0, new QueryFailure({ code }))).toBe(false);
  });

  it('reads a rejection that is not the failure of a use case as unexpected, and tries it again', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
    expect(shouldRetry(0, 'boom')).toBe(true);
    expect(shouldRetry(0, undefined)).toBe(true);
    expect(shouldRetry(MAX_QUERY_RETRIES, new Error('boom'))).toBe(false);
  });

  it('reads a code that is not one of the app as unexpected, and tries it again', () => {
    expect(shouldRetry(0, new QueryFailure({ code: 'unheardOf' }))).toBe(true);
  });

  it('waits twice as long before each retry, up to a limit', () => {
    expect(retryDelay(0)).toBe(500);
    expect(retryDelay(1)).toBe(1000);
    expect(retryDelay(2)).toBe(2000);
    expect(retryDelay(3)).toBe(4000);
    expect(retryDelay(10)).toBe(4000);
  });
});
