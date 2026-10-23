export const AUTHENTICATION_ERROR_CODE = {
  InvalidCredentials: 'invalidCredentials',
  SessionExpired: 'sessionExpired',
  NotAuthenticated: 'notAuthenticated',
  SessionChanged: 'sessionChanged',
  AppLocked: 'appLocked',
} as const;

/** The email and password pair was refused. */
export interface InvalidCredentialsError {
  readonly code: typeof AUTHENTICATION_ERROR_CODE.InvalidCredentials;
}

/** A session exists but its expiry has passed. */
export interface SessionExpiredError {
  readonly code: typeof AUTHENTICATION_ERROR_CODE.SessionExpired;
}

/** An operation that needs a signed-in user ran without a session. */
export interface NotAuthenticatedError {
  readonly code: typeof AUTHENTICATION_ERROR_CODE.NotAuthenticated;
}

/** The user who started a long operation is no longer the signed-in user. */
export interface SessionChangedError {
  readonly code: typeof AUTHENTICATION_ERROR_CODE.SessionChanged;
}

/**
 * A session exists and is valid, but the app is locked: nobody has proven they are there since the
 * app was started, or since it came back from the background past the grace period. Nothing is
 * read, queued or sent for the user until the biometric unlock succeeds.
 */
export interface AppLockedError {
  readonly code: typeof AUTHENTICATION_ERROR_CODE.AppLocked;
}

export type AuthenticationError =
  | InvalidCredentialsError
  | SessionExpiredError
  | NotAuthenticatedError
  | SessionChangedError
  | AppLockedError;

export function invalidCredentials(): InvalidCredentialsError {
  return { code: AUTHENTICATION_ERROR_CODE.InvalidCredentials };
}

export function sessionExpired(): SessionExpiredError {
  return { code: AUTHENTICATION_ERROR_CODE.SessionExpired };
}

export function notAuthenticated(): NotAuthenticatedError {
  return { code: AUTHENTICATION_ERROR_CODE.NotAuthenticated };
}

export function sessionChanged(): SessionChangedError {
  return { code: AUTHENTICATION_ERROR_CODE.SessionChanged };
}

export function appLocked(): AppLockedError {
  return { code: AUTHENTICATION_ERROR_CODE.AppLocked };
}
