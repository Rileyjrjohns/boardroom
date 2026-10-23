import type {
  BiometricAvailabilityError,
  BiometricError,
} from '@features/auth/domain/errors/BiometricError';
import { ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import type { BiometricGate, BiometricReason } from '../ports/BiometricGate';

/** A device whose biometrics work, until the test says otherwise. */
export class FakeBiometricGate implements BiometricGate {
  /** What `checkAvailability` answers. */
  availability: Result<void, BiometricAvailabilityError> = ok(undefined);
  /** What `authenticate` answers. */
  authentication: Result<void, BiometricError> = ok(undefined);

  /**
   * Called when a prompt is shown, before the user answers: a test uses it to change the world
   * while the user is looking at the prompt (another user signs in, say).
   */
  onPrompt: (() => void | Promise<void>) | undefined;

  /** The reason of every prompt shown, in order. */
  readonly prompts: BiometricReason[] = [];
  availabilityChecks = 0;

  checkAvailability(): Promise<Result<void, BiometricAvailabilityError>> {
    this.availabilityChecks += 1;
    return Promise.resolve(this.availability);
  }

  async authenticate(reason: BiometricReason): Promise<Result<void, BiometricError>> {
    this.prompts.push(reason);
    await this.onPrompt?.();
    return this.authentication;
  }
}
