import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { map } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireIntegerInRange } from '../shared/validation';

/** About a century: far above any duration the app uses, far below what an `Instant` can hold. */
const MAX_DURATION_MILLIS = 3_153_600_000_000;

/** A length of time, as a whole, non-negative number of milliseconds. */
export type Duration = Brand<number, 'Duration'>;

export function durationFromMillis(millis: number): Result<Duration, ValidationError> {
  return map(
    requireIntegerInRange(VALIDATION_FIELD.Duration, millis, 0, MAX_DURATION_MILLIS),
    (value) => value as Duration,
  );
}
