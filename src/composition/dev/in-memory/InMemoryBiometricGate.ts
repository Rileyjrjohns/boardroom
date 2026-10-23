import type {
  BiometricAvailabilityError,
  BiometricError,
} from '@core/domain/errors/BiometricError';
import { ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type {
  BiometricGate,
  BiometricReason,
} from '@features/auth/application/ports/BiometricGate';

/**
 * The biometrics of the mock configuration: always available, and the user is always recognised,
 * so the demo runs on a simulator without enrolment. A test can make the device lack biometrics,
 * or the user fail, to exercise the paths that fail closed.
 */
export class InMemoryBiometricGate implements BiometricGate {
  private availability: Result<void, BiometricAvailabilityError> = ok(undefined);
  private authentication: Result<void, BiometricError> = ok(undefined);
  private readonly shown: BiometricReason[] = [];

  /** What `checkAvailability` answers from now on. */
  setAvailability(availability: Result<void, BiometricAvailabilityError>): void {
    this.availability = availability;
  }

  /** What `authenticate` answers from now on. */
  setAuthentication(authentication: Result<void, BiometricError>): void {
    this.authentication = authentication;
  }

  /** The reason of every prompt shown so far, in order. */
  prompts(): readonly BiometricReason[] {
    return [...this.shown];
  }

  checkAvailability(): Promise<Result<void, BiometricAvailabilityError>> {
    return Promise.resolve(this.availability);
  }

  authenticate(reason: BiometricReason): Promise<Result<void, BiometricError>> {
    this.shown.push(reason);
    return Promise.resolve(this.authentication);
  }
}
