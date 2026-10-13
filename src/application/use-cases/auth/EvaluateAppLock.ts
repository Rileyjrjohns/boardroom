import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isUnlockRequired } from '@domain/policies/appLock';
import { isSessionExpired } from '@domain/policies/sessionExpiry';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';
import type { Instant } from '@domain/value-objects/Instant';

import type { AuthSession } from '../../ports/AuthSession';
import type { Clock } from '../../ports/Clock';

export interface EvaluateAppLockDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
  /** Configuration, set once by the composition root: how long the app may stay in the background. */
  readonly gracePeriod: Duration;
}

export interface EvaluateAppLockInput {
  /** When the app went to the background. The presentation records it. */
  readonly backgroundedAt: Instant;
}

/**
 * Decides, when the app returns from the background, whether the user must unlock it with the
 * biometrics (see `isUnlockRequired`). Succeeds with `true` when they must. Nobody signed in, or
 * a session that has expired, means there is nothing to lock.
 *
 * When the stored session cannot be read, the error is returned and the caller must treat it as
 * "locked": the use case cannot say there is nothing to protect.
 */
export class EvaluateAppLock {
  constructor(private readonly deps: EvaluateAppLockDeps) {}

  async execute(input: EvaluateAppLockInput): Promise<Result<boolean, StorageReadFailedError>> {
    const { auth, clock, gracePeriod } = this.deps;

    const current = await auth.current();
    if (isErr(current)) return current;

    const now = clock.now();
    const session = current.value;
    return ok(
      isUnlockRequired({
        backgroundedAt: input.backgroundedAt,
        now,
        gracePeriod,
        hasSession: session !== undefined && !isSessionExpired(session, now),
      }),
    );
  }
}
