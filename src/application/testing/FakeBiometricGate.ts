import type { BiometricAvailabilityError, BiometricError } from '@domain/errors/BiometricError';
import { ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { BiometricGate, BiometricReason } from '../ports/BiometricGate';

/** A device whose biometrics work, until the test says otherwise. */
export class FakeBiometricGate implements BiometricGate {
  /** What `checkAvailability` answers. */
  availability: Result<void, BiometricAvailabilityError> = ok(undefined);
  /** What `authenticate` answers. */
  authentication: Result<void, BiometricError> = ok(undefined);

  /** The reason of every prompt shown, in order. */
  readonly prompts: BiometricReason[] = [];
  availabilityChecks = 0;

  checkAvailability(): Promise<Result<void, BiometricAvailabilityError>> {
    this.availabilityChecks += 1;
    return Promise.resolve(this.availability);
  }

  authenticate(reason: BiometricReason): Promise<Result<void, BiometricError>> {
    this.prompts.push(reason);
    return Promise.resolve(this.authentication);
  }
}
