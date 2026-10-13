import type { ValueOf } from '@domain/shared/constants';
import type { BiometricAvailabilityError, BiometricError } from '@domain/errors/BiometricError';
import type { Result } from '@domain/shared/Result';

/**
 * Why the user is asked for a biometric proof. The application names a reason; the adapter (or the
 * presentation) turns it into the text of the system prompt, in the language of the user. No text
 * travels through this port.
 */
export const BIOMETRIC_REASON = {
  UnlockApp: 'unlockApp',
  ConfirmVote: 'confirmVote',
} as const;

export type BiometricReason = ValueOf<typeof BIOMETRIC_REASON>;

/**
 * The biometric check of the device (fingerprint, face).
 *
 * Contract: no method throws or rejects. A refusal of the user is an error `Result`, not an
 * exception. A prompt waits for the user, so its duration is theirs, but it always ends with a
 * result (`cancelled` included); a check of the capability settles in bounded time.
 */
export interface BiometricGate {
  /** Succeeds when biometrics can be used right now: hardware present, at least one enrolment. */
  checkAvailability(): Promise<Result<void, BiometricAvailabilityError>>;

  /** Shows the system prompt for a reason. Succeeds only when the user is recognised. */
  authenticate(reason: BiometricReason): Promise<Result<void, BiometricError>>;
}
