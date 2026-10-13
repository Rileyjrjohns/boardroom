import type { BiometricError } from '@domain/errors/BiometricError';
import type { Result } from '@domain/shared/Result';

import { BIOMETRIC_REASON } from '../../ports/BiometricGate';
import type { BiometricGate } from '../../ports/BiometricGate';
import { confirmWithBiometrics } from '../../shared/confirmWithBiometrics';

export interface UnlockAppDeps {
  readonly biometricGate: BiometricGate;
}

/**
 * Unlocks the app with a biometric proof. It fails closed: when the biometrics cannot be used
 * (`biometricUnavailable`, `biometricNotEnrolled`), or the user cannot be recognised, the app stays
 * locked and nothing else unlocks it. On a device where they can never be used, the only way
 * forward is to sign out and sign in again (see `RestoreSession`).
 */
export class UnlockApp {
  constructor(private readonly deps: UnlockAppDeps) {}

  execute(): Promise<Result<void, BiometricError>> {
    return confirmWithBiometrics(this.deps.biometricGate, BIOMETRIC_REASON.UnlockApp);
  }
}
