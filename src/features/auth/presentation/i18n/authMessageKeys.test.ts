import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE, VALIDATION_RULE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { SESSION_ENDING_CODES } from '@features/auth/application/session/sessionPolicy';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import { describeTranslationMaps } from '@testing/presentation/translationMaps';

import {
  BIOMETRIC_PROMPT_KEYS,
  EMAIL_RULE_KEYS,
  PASSWORD_RULE_KEYS,
  SESSION_ENDED_KEYS,
  SESSION_ERROR_KEYS,
  SIGN_IN_ERROR_KEYS,
  UNLOCK_ERROR_KEYS,
} from './authMessageKeys';

describeTranslationMaps(
  {
    BIOMETRIC_PROMPT_KEYS: [BIOMETRIC_PROMPT_KEYS, valuesOf(BIOMETRIC_REASON)],
    SIGN_IN_ERROR_KEYS: [
      SIGN_IN_ERROR_KEYS,
      [
        VALIDATION_ERROR_CODE.Validation,
        AUTHENTICATION_ERROR_CODE.InvalidCredentials,
        REPOSITORY_ERROR_CODE.NetworkUnavailable,
        REPOSITORY_ERROR_CODE.Unexpected,
        STORAGE_ERROR_CODE.WriteFailed,
      ],
    ],
    EMAIL_RULE_KEYS: [EMAIL_RULE_KEYS, valuesOf(VALIDATION_RULE)],
    PASSWORD_RULE_KEYS: [PASSWORD_RULE_KEYS, valuesOf(VALIDATION_RULE)],
    UNLOCK_ERROR_KEYS: [
      UNLOCK_ERROR_KEYS,
      [...valuesOf(BIOMETRIC_ERROR_CODE), REPOSITORY_ERROR_CODE.Unexpected],
    ],
    SESSION_ERROR_KEYS: [
      SESSION_ERROR_KEYS,
      [
        AUTHENTICATION_ERROR_CODE.NotAuthenticated,
        AUTHENTICATION_ERROR_CODE.SessionExpired,
        AUTHENTICATION_ERROR_CODE.AppLocked,
        AUTHENTICATION_ERROR_CODE.SessionChanged,
      ],
    ],
    SESSION_ENDED_KEYS: [SESSION_ENDED_KEYS, SESSION_ENDING_CODES],
  },
  // The rules that cannot concern a field of text have no message of their own and take the
  // nearest one.
  { EMAIL_RULE_KEYS: 4, PASSWORD_RULE_KEYS: 6 },
);
