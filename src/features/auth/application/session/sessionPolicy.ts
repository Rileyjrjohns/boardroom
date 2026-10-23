import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';

/**
 * The failures that say the session of the user is over, whatever the operation was doing: the
 * server refused the session, there is none, it has expired or is another one, or the app is
 * locked. Whoever meets one ends the session for the whole app, and nothing of the previous
 * session may stay on the screen or in memory.
 */
export const SESSION_ENDING_CODES = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.AppLocked,
] as const;

export type SessionEndingCode = (typeof SESSION_ENDING_CODES)[number];

const SESSION_ENDING_SET: ReadonlySet<string> = new Set(SESSION_ENDING_CODES);

/** Any code, not only those of the meetings: a synchronisation and an action meet them too. */
export function isSessionEndingCode(code: string): code is SessionEndingCode {
  return SESSION_ENDING_SET.has(code);
}

/**
 * How often an app that stays open and in the foreground asks whether its session is still good,
 * in milliseconds. A session that expires while the user looks at the screen must not leave the
 * data on it until the next request happens to find out: the longest it can stay is this, plus the
 * time of a check. The check is local (the session guard reads the stored session and the clock),
 * so a short period costs nothing; it is long enough not to be a loop.
 */
export const SESSION_CHECK_INTERVAL_MILLIS = 30_000;
