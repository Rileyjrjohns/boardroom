import { valuesOf } from '@core/domain/shared/constants';

import {
  AUTHENTICATION_ERROR_CODE,
  appLocked,
  invalidCredentials,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from './AuthenticationError';
import {
  BIOMETRIC_ERROR_CODE,
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from './BiometricError';

describe('error factories', () => {
  it('build the authentication errors', () => {
    expect(invalidCredentials().code).toBe(AUTHENTICATION_ERROR_CODE.InvalidCredentials);
    expect(sessionExpired().code).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);
    expect(notAuthenticated().code).toBe(AUTHENTICATION_ERROR_CODE.NotAuthenticated);
    expect(sessionChanged().code).toBe(AUTHENTICATION_ERROR_CODE.SessionChanged);
    expect(appLocked()).toEqual({ code: AUTHENTICATION_ERROR_CODE.AppLocked });
  });

  it('build the biometric errors', () => {
    expect([
      biometricUnavailable().code,
      biometricNotEnrolled().code,
      biometricCancelled().code,
      biometricFailed().code,
      biometricLockedOut().code,
    ]).toEqual(valuesOf(BIOMETRIC_ERROR_CODE));
  });
});
