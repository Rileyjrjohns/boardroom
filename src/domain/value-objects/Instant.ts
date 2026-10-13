import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { map } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireIntegerInRange } from '../shared/validation';

import type { Duration } from './Duration';

/**
 * The largest number of milliseconds a JavaScript `Date` can hold. An `Instant` never exceeds it,
 * so `new Date(instant)` is always a valid date for the presentation to format.
 */
const MAX_EPOCH_MILLIS = 8_640_000_000_000_000;

/**
 * A point in time, as a whole number of milliseconds since the Unix epoch, in UTC. A plain number
 * at runtime: immutable, comparable with the usual operators, and serialisable as is. The domain
 * never formats it and has no time zone: both belong to the presentation.
 */
export type Instant = Brand<number, 'Instant'>;

export function parseInstant(epochMillis: number): Result<Instant, ValidationError> {
  return map(
    requireIntegerInRange(VALIDATION_FIELD.Instant, epochMillis, 0, MAX_EPOCH_MILLIS),
    (millis) => millis as Instant,
  );
}

export function isBefore(instant: Instant, other: Instant): boolean {
  return instant < other;
}

/** The instant is `other`, or later. */
export function isAtOrAfter(instant: Instant, other: Instant): boolean {
  return instant >= other;
}

/** The instant `duration` after `instant`. Fails only when the result would leave the supported range. */
export function plus(instant: Instant, duration: Duration): Result<Instant, ValidationError> {
  return parseInstant(instant + duration);
}

/** Milliseconds from `from` to `to`. Negative when `to` is earlier than `from`. */
export function millisBetween(from: Instant, to: Instant): number {
  return to - from;
}
