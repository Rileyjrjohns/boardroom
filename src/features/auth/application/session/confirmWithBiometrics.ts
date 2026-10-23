import type { BiometricError } from '@core/domain/errors/BiometricError';
import { andThenAsync } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import type { BiometricGate, BiometricReason } from '../ports/BiometricGate';

/**
 * Asks the user for a biometric proof. The capability is checked first, so that a device without
 * biometrics, or without enrolment, is reported without ever showing a prompt.
 */
export function confirmWithBiometrics(
  gate: BiometricGate,
  reason: BiometricReason,
): Promise<Result<void, BiometricError>> {
  return andThenAsync(gate.checkAvailability(), () => gate.authenticate(reason));
}
