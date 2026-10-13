import type { Session } from '@domain/entities/Session';
import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import type {
  NotAuthenticatedError,
  SessionExpiredError,
} from '@domain/errors/AuthenticationError';
import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isSessionExpired } from '@domain/policies/sessionExpiry';
import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { AuthSession } from '../ports/AuthSession';
import type { Clock } from '../ports/Clock';

export type SessionRequiredError =
  NotAuthenticatedError | SessionExpiredError | StorageReadFailedError;

export interface RequireSessionDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
}

/**
 * The session of the signed-in user, for a use case that cannot run without one. Nobody signed in
 * is `notAuthenticated`; a session whose expiry has passed is `sessionExpired`, and is never
 * returned.
 */
export async function requireSession(
  deps: RequireSessionDeps,
): Promise<Result<Session, SessionRequiredError>> {
  const current = await deps.auth.current();
  if (isErr(current)) return current;
  if (current.value === undefined) return err(notAuthenticated());
  if (isSessionExpired(current.value, deps.clock.now())) return err(sessionExpired());
  return ok(current.value);
}
