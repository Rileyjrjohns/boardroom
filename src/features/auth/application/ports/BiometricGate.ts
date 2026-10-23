import type {
  BiometricAvailabilityError,
  BiometricError,
} from '@features/auth/domain/errors/BiometricError';
import type { Result } from '@core/domain/shared/Result';
import type { ValueOf } from '@core/domain/shared/constants';

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
 * It proves that a person enrolled on this device is present. It does not prove that this person
 * is the user of the session: a device may hold several fingerprints. Whether the device passcode
 * is accepted as a fallback when the biometrics fail is a setting of the adapter, chosen at the
 * composition root (a board that wants biometrics only turns it off); nothing in this port or in
 * the application depends on the choice.
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
