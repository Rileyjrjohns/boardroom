import type { BiometricError } from '@domain/errors/BiometricError';
import { isOk } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { BIOMETRIC_REASON } from '../../ports/BiometricGate';
import type { BiometricGate } from '../../ports/BiometricGate';
import type { AppLock } from '../../shared/AppLock';
import { confirmWithBiometrics } from '../../shared/confirmWithBiometrics';

export interface UnlockAppDeps {
  readonly biometricGate: BiometricGate;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

/**
 * Unlocks the app with a biometric proof, and opens the `AppLock`: until it succeeds, no use case
 * returns data to the user. It fails closed: when the biometrics cannot be used
 * (`biometricUnavailable`, `biometricNotEnrolled`), or the user cannot be recognised, the app
 * stays locked and nothing else unlocks it. On a device where they can never be used, the only way
 * forward is to sign out and sign in again (see `RestoreSession`).
 *
 * The biometrics prove that a person enrolled on this device is present, not that this person is
 * the user of the session: the device may hold several fingerprints. That is the limit of the
 * lock, and the reason the session itself expires.
 */
export class UnlockApp {
  constructor(private readonly deps: UnlockAppDeps) {}

  async execute(): Promise<Result<void, BiometricError>> {
    const confirmed = await confirmWithBiometrics(
      this.deps.biometricGate,
      BIOMETRIC_REASON.UnlockApp,
    );
    if (isOk(confirmed)) this.deps.appLock.unlock();
    return confirmed;
  }
}
