import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isUnlockRequired } from '@domain/policies/appLock';
import { isSessionExpired } from '@domain/policies/sessionExpiry';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';
import type { Instant } from '@domain/value-objects/Instant';

import type { AuthSession } from '../../ports/AuthSession';
import type { Clock } from '../../ports/Clock';
import type { AppLock } from '../../shared/AppLock';

export interface EvaluateAppLockDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
  /** Configuration, set once by the composition root: how long the app may stay in the background. */
  readonly gracePeriod: Duration;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

export interface EvaluateAppLockInput {
  /** When the app went to the background. The presentation records it. */
  readonly backgroundedAt: Instant;
}

/**
 * Decides, when the app returns from the background, whether the user must unlock it with the
 * biometrics (see `isUnlockRequired`). Succeeds with `true` when they must, and then the
 * `AppLock` is closed, so that no use case serves anything until `UnlockApp` succeeds: the answer
 * is the information for the screen, the lock is the enforcement. Nobody signed in, or a session
 * that has expired, means there is nothing to lock.
 *
 * When the stored session cannot be read, the lock is closed too, and the error is returned: the
 * use case cannot say there is nothing to protect, so it fails closed.
 */
export class EvaluateAppLock {
  constructor(private readonly deps: EvaluateAppLockDeps) {}

  async execute(input: EvaluateAppLockInput): Promise<Result<boolean, StorageReadFailedError>> {
    const { auth, clock, gracePeriod, appLock } = this.deps;

    const current = await auth.current();
    if (isErr(current)) {
      appLock.lock();
      return current;
    }

    const now = clock.now();
    const session = current.value;
    const required = isUnlockRequired({
      backgroundedAt: input.backgroundedAt,
      now,
      gracePeriod,
      hasSession: session !== undefined && !isSessionExpired(session, now),
    });
    if (required) appLock.lock();
    return ok(required);
  }
}
