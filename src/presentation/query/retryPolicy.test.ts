import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@domain/errors/ValidationError';

import { QueryFailure } from './QueryFailure';
import { MAX_QUERY_RETRIES, isRetryableCode, retryDelay, shouldRetry } from './retryPolicy';

const RETRYABLE = [
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
];
const NOT_RETRYABLE = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  REPOSITORY_ERROR_CODE.NotFound,
  VALIDATION_ERROR_CODE.Validation,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
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
    expect(isRetryableCode(code)).toBe(false);
  });

  it('does not try again a thrown value that is not a failure of a use case: it is a bug', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(false);
    expect(shouldRetry(0, 'boom')).toBe(false);
    expect(shouldRetry(0, undefined)).toBe(false);
  });

  it('waits twice as long before each retry, up to a limit', () => {
    expect(retryDelay(0)).toBe(500);
    expect(retryDelay(1)).toBe(1000);
    expect(retryDelay(2)).toBe(2000);
    expect(retryDelay(3)).toBe(4000);
    expect(retryDelay(10)).toBe(4000);
  });
});
