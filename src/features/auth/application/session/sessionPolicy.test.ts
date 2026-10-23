import { AUTHENTICATION_ERROR_CODE } from '@core/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@core/domain/errors/ScreenProtectionError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';

import {
  SESSION_CHECK_INTERVAL_MILLIS,
  SESSION_ENDING_CODES,
  isSessionEndingCode,
} from './sessionPolicy';

const SESSION_ENDING = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.AppLocked,
];
const OTHERS = [
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Forbidden,
  REPOSITORY_ERROR_CODE.NotFound,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
  STORAGE_ERROR_CODE.WriteFailed,
  VALIDATION_ERROR_CODE.Validation,
  AUTHENTICATION_ERROR_CODE.InvalidCredentials,
  SCREEN_PROTECTION_ERROR_CODE.Failed,
  SCREEN_PROTECTION_ERROR_CODE.Unsupported,
];

describe('the codes that end the session', () => {
  it('are these five, and no other', () => {
    expect([...SESSION_ENDING_CODES].sort()).toEqual([...SESSION_ENDING].sort());
  });

  it.each(SESSION_ENDING)('recognises %s', (code) => {
    expect(isSessionEndingCode(code)).toBe(true);
  });

  it.each(OTHERS)('does not recognise %s: it concerns one request, not the session', (code) => {
    expect(isSessionEndingCode(code)).toBe(false);
  });

  it('does not recognise a code that is not one of the app, nor an empty one', () => {
    expect(isSessionEndingCode('anything')).toBe(false);
    expect(isSessionEndingCode('')).toBe(false);
  });
});

describe('the interval of the session check', () => {
  it('is thirty seconds', () => {
    expect(SESSION_CHECK_INTERVAL_MILLIS).toBe(30_000);
  });
});
