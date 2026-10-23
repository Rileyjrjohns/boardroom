import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { valuesOf } from '@core/domain/shared/constants';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';
import { describeTranslationMaps } from '@testing/presentation/translationMaps';

import { CAPTURE_NOTICE_KEYS, DOCUMENT_ERROR_KEYS } from './documentMessageKeys';

describeTranslationMaps({
  DOCUMENT_ERROR_KEYS: [
    DOCUMENT_ERROR_KEYS,
    [
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
      AUTHENTICATION_ERROR_CODE.SessionExpired,
      AUTHENTICATION_ERROR_CODE.AppLocked,
      AUTHENTICATION_ERROR_CODE.SessionChanged,
      STORAGE_ERROR_CODE.ReadFailed,
      REPOSITORY_ERROR_CODE.NetworkUnavailable,
      REPOSITORY_ERROR_CODE.Unauthorized,
      REPOSITORY_ERROR_CODE.Forbidden,
      REPOSITORY_ERROR_CODE.NotFound,
      REPOSITORY_ERROR_CODE.Unexpected,
      ...valuesOf(SCREEN_PROTECTION_ERROR_CODE),
    ],
  ],
});

describe('CAPTURE_NOTICE_KEYS', () => {
  it('has an entry for every kind of capture, and for nothing else', () => {
    expect(Object.keys(CAPTURE_NOTICE_KEYS).sort()).toEqual(
      [...valuesOf(SCREEN_CAPTURE_KIND)].sort(),
    );
  });

  it('tells a screenshot and the start of a recording, and not the end of a recording', () => {
    expect(CAPTURE_NOTICE_KEYS[SCREEN_CAPTURE_KIND.ScreenshotTaken]).toBe(
      'document.capture.screenshot',
    );
    expect(CAPTURE_NOTICE_KEYS[SCREEN_CAPTURE_KIND.RecordingStarted]).toBe(
      'document.capture.recording',
    );
    expect(CAPTURE_NOTICE_KEYS[SCREEN_CAPTURE_KIND.RecordingStopped]).toBeUndefined();
  });
});
