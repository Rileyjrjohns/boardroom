export const BIOMETRIC_ERROR_CODE = {
  Unavailable: 'biometricUnavailable',
  NotEnrolled: 'biometricNotEnrolled',
  Cancelled: 'biometricCancelled',
  Failed: 'biometricFailed',
  LockedOut: 'biometricLockedOut',
} as const;

/** The device has no biometric hardware, or the app may not use it. */
export interface BiometricUnavailableError {
  readonly code: typeof BIOMETRIC_ERROR_CODE.Unavailable;
}

/** The device has biometric hardware but the user has registered no fingerprint or face. */
export interface BiometricNotEnrolledError {
  readonly code: typeof BIOMETRIC_ERROR_CODE.NotEnrolled;
}

/** The user dismissed the prompt. */
export interface BiometricCancelledError {
  readonly code: typeof BIOMETRIC_ERROR_CODE.Cancelled;
}

/** The prompt was shown and the user did not match. */
export interface BiometricFailedError {
  readonly code: typeof BIOMETRIC_ERROR_CODE.Failed;
}

/** Too many failed attempts: the system refuses new ones for a while. */
export interface BiometricLockedOutError {
  readonly code: typeof BIOMETRIC_ERROR_CODE.LockedOut;
}

/** What a check of the biometric capability can report. */
export type BiometricAvailabilityError = BiometricUnavailableError | BiometricNotEnrolledError;

/** What an authentication can fail with. */
export type BiometricError =
  | BiometricAvailabilityError
  | BiometricCancelledError
  | BiometricFailedError
  | BiometricLockedOutError;

export function biometricUnavailable(): BiometricUnavailableError {
  return { code: BIOMETRIC_ERROR_CODE.Unavailable };
}

export function biometricNotEnrolled(): BiometricNotEnrolledError {
  return { code: BIOMETRIC_ERROR_CODE.NotEnrolled };
}

export function biometricCancelled(): BiometricCancelledError {
  return { code: BIOMETRIC_ERROR_CODE.Cancelled };
}

export function biometricFailed(): BiometricFailedError {
  return { code: BIOMETRIC_ERROR_CODE.Failed };
}

export function biometricLockedOut(): BiometricLockedOutError {
  return { code: BIOMETRIC_ERROR_CODE.LockedOut };
}
