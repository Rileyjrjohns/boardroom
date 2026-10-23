import type { Clock } from '@core/application/ports/Clock';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@features/auth/domain/errors/AuthenticationError';
import type {
  AppLockedError,
  NotAuthenticatedError,
  SessionChangedError,
  SessionExpiredError,
} from '@features/auth/domain/errors/AuthenticationError';
import type { StorageReadFailedError } from '@core/domain/errors/StorageError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';
import type { Session } from '@features/auth/domain/entities/Session';
import { isSessionExpired } from '@features/auth/domain/policies/sessionExpiry';

import type { EndSessionDeps } from './endSession';
import { purgeCaches } from './purgeCaches';

export type SessionRequiredError =
  NotAuthenticatedError | SessionExpiredError | AppLockedError | StorageReadFailedError;

/**
 * What `requireSession` and `requireSameUser` need: what `closeSession` needs (the session, the
 * lock shared by every use case, and the purgers of the data a session leaves, which run when a
 * session is found expired: see `requireSession`) plus the clock.
 */
export interface RequireSessionDeps extends EndSessionDeps {
  /** The clock the expiry of the session is judged by. */
  readonly clock: Clock;
}

/**
 * The session of the signed-in user, for a use case that cannot run without one. It is the one
 * guard every use case that reads, queues or sends something for the user goes through, and it
 * fails, in this order, with:
 *
 * - `notAuthenticated` when nobody is signed in;
 * - `sessionExpired` when the expiry has passed. The session is never returned, and the caches are
 *   emptied (all of them, for every owner, as at a sign-out): a session that ends while the app is
 *   running must not leave the content of its user on the device. The purge is best effort, a
 *   failure is captured and the caller still gets `sessionExpired`;
 * - `appLocked` when the session is valid but the app is locked (see `AppLock`): until the
 *   biometric unlock succeeds, no use case returns data to, or acts for, the user.
 */
export async function requireSession(
  deps: RequireSessionDeps,
): Promise<Result<Session, SessionRequiredError>> {
  const current = await deps.auth.current();
  if (isErr(current)) return current;
  if (current.value === undefined) return err(notAuthenticated());
  if (isSessionExpired(current.value, deps.clock.now())) {
    await purgeCaches(deps);
    return err(sessionExpired());
  }
  if (deps.appLock.isLocked()) return err(appLocked());
  return ok(current.value);
}

/**
 * The same, and the user must be `expected`. A use case that started for a user and has waited for
 * something (the network, a biometric prompt) calls it before it writes anything or returns
 * anything: if somebody else is signed in now, the answer is `sessionChanged` and the use case
 * stops. The session it returns is the one to read the identity from afterwards, not the one read
 * before the wait.
 */
export async function requireSameUser(
  deps: RequireSessionDeps,
  expected: UserId,
): Promise<Result<Session, SessionRequiredError | SessionChangedError>> {
  const session = await requireSession(deps);
  if (isErr(session)) return session;
  return session.value.user.id === expected ? session : err(sessionChanged());
}
