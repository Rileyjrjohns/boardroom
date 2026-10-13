import type { Duration } from '../value-objects/Duration';
import { isBefore, millisBetween } from '../value-objects/Instant';
import type { Instant } from '../value-objects/Instant';

export interface AppLockInput {
  /** When the app went to the background. */
  readonly backgroundedAt: Instant;
  readonly now: Instant;
  /** How long the app may stay in the background without asking for the biometrics again. */
  readonly gracePeriod: Duration;
  /** Whether a user is signed in. */
  readonly hasSession: boolean;
}

/**
 * Must the user unlock the app with the biometrics on returning from the background?
 *
 * - Without a session there is nothing to protect: no.
 * - Once the grace period has elapsed (a grace period of zero locks every time): yes.
 * - When `now` is earlier than the instant the app went to the background, the clock has been set
 *   back and the time away cannot be known: yes. The rule fails closed.
 */
export function isUnlockRequired(input: AppLockInput): boolean {
  if (!input.hasSession) return false;
  if (isBefore(input.now, input.backgroundedAt)) return true;
  return millisBetween(input.backgroundedAt, input.now) >= input.gracePeriod;
}
