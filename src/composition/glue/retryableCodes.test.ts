import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { SESSION_ENDING_CODES } from '@features/auth/application/session/sessionPolicy';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';

import { RETRYABLE_CODES, isRetryableCode } from './retryableCodes';

const RETRYABLE = [
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
  SCREEN_PROTECTION_ERROR_CODE.Failed,
];
const NOT_RETRYABLE = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  REPOSITORY_ERROR_CODE.Forbidden,
  REPOSITORY_ERROR_CODE.NotFound,
  STORAGE_ERROR_CODE.WriteFailed,
  VALIDATION_ERROR_CODE.Validation,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.AppLocked,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.InvalidCredentials,
  SCREEN_PROTECTION_ERROR_CODE.Unsupported,
];

describe('the codes a second try can fix', () => {
  it('are these four, and no other', () => {
    expect([...RETRYABLE_CODES].sort()).toEqual([...RETRYABLE].sort());
  });

  it.each(RETRYABLE)('includes %s', (code) => {
    expect(isRetryableCode(code)).toBe(true);
  });

  it.each(NOT_RETRYABLE)('leaves out %s: asking again cannot change it', (code) => {
    expect(isRetryableCode(code)).toBe(false);
  });

  it('offers a retry for a screen protection that failed, and not for a platform that has none', () => {
    expect(isRetryableCode(SCREEN_PROTECTION_ERROR_CODE.Failed)).toBe(true);
    expect(isRetryableCode(SCREEN_PROTECTION_ERROR_CODE.Unsupported)).toBe(false);
  });

  it('leaves out a code that is not one of the app, and an empty one', () => {
    expect(isRetryableCode('unheardOf')).toBe(false);
    expect(isRetryableCode('')).toBe(false);
  });

  it.each([...SESSION_ENDING_CODES])(
    'leaves out %s: a failure that ends the session is final',
    (code) => {
      expect(isRetryableCode(code)).toBe(false);
    },
  );
});
