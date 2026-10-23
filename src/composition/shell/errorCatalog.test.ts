import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';
import { SESSION_ENDING_CODES } from '@features/auth/application/session/sessionPolicy';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';
import { MEETINGS_ERROR_KEYS } from '@features/meetings/presentation/i18n/meetingMessageKeys';

import { RETRYABLE_CODES } from '../glue/retryableCodes';

import { ERROR_CATALOG } from './errorCatalog';

// What the screens know of the failures of the app is put together here from what the core and the
// features each say of their own codes. The shared components read it.

describe('the catalog of errors of the app', () => {
  it('has a text for every failure a screen of the meetings can meet', () => {
    expect(Object.keys(MEETINGS_ERROR_KEYS).filter((code) => !ERROR_CATALOG.has(code))).toEqual([]);
  });

  it('has a text for every failure that ends the session, since the screens of the open app meet them', () => {
    expect(SESSION_ENDING_CODES.filter((code) => !ERROR_CATALOG.has(code))).toEqual([]);
  });

  it('has a text for the failures of the core and of the session, and for those alone', () => {
    const known = [
      ...valuesOf(REPOSITORY_ERROR_CODE),
      STORAGE_ERROR_CODE.ReadFailed,
      VALIDATION_ERROR_CODE.Validation,
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
      AUTHENTICATION_ERROR_CODE.SessionExpired,
      AUTHENTICATION_ERROR_CODE.AppLocked,
      AUTHENTICATION_ERROR_CODE.SessionChanged,
    ];

    expect(known.filter((code) => !ERROR_CATALOG.has(code))).toEqual([]);
    expect(ERROR_CATALOG.has(AUTHENTICATION_ERROR_CODE.InvalidCredentials)).toBe(false);
    expect(ERROR_CATALOG.has(SCREEN_PROTECTION_ERROR_CODE.Failed)).toBe(false);
  });

  it('lets a second try fix what the core and the documents say it can: the assembled set of the specification', () => {
    expect([...RETRYABLE_CODES].filter((code) => !ERROR_CATALOG.isRetryableCode(code))).toEqual([]);
    expect(ERROR_CATALOG.isRetryableCode(SCREEN_PROTECTION_ERROR_CODE.Failed)).toBe(true);
    expect(ERROR_CATALOG.isRetryableCode(SCREEN_PROTECTION_ERROR_CODE.Unsupported)).toBe(false);
    expect(ERROR_CATALOG.isRetryableCode(AUTHENTICATION_ERROR_CODE.SessionExpired)).toBe(false);
  });
});
