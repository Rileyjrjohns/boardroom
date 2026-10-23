import type { AppError } from '@core/domain/errors/AppError';
import type { Result } from '@core/domain/shared/Result';
import type { UserId } from '@core/domain/value-objects/ids';

import type { SessionRefusal } from './types/SessionRefusal';

/**
 * What the offline policy (`loadWithCacheFallback`) needs to know about the session, and nothing
 * more. The policy is shared by every feature that reads remote data into a cache, so it is in the
 * core; the session is the business of `auth`, which implements this port (`AuthSessionGate`) and
 * is the only one to know what a session is. The core imports no feature, and a feature that loads
 * data hands the policy a gate through its deps.
 *
 * `Refusal` is the family of errors the gate refuses with, so that the use cases that go through
 * the policy keep the precise type of what they can return.
 */
export interface SessionGate<Refusal extends AppError = AppError> {
  /**
   * Succeeds with the user who is signed in, when it is `expected` and the app is unlocked.
   * Otherwise the `SessionRefusal` says why: nobody is signed in, the session has expired,
   * somebody else is signed in, or the app is locked.
   */
  requireSameUser(expected: UserId): Promise<Result<UserId, SessionRefusal<Refusal>>>;

  /**
   * Ends the session of `user`, which the server refused: the app is locked, what the session left
   * on the device is emptied, and the session is forgotten. Never fails, nothing is reported to the
   * caller, which has the refusal to return.
   */
  endRefusedSession(user: UserId): Promise<void>;

  /**
   * Empties what a session leaves on the device, for every owner. Best effort: a failure is
   * reported by the implementation and never returned.
   */
  purgeSessionData(): Promise<void>;
}
