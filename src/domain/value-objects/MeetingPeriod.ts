import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { findConstant, valuesOf } from '../shared/constants';
import type { ValueOf } from '../shared/constants';
import { err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';

/** The two lists of meetings. Which one a meeting belongs to depends on the current instant. */
export const MEETING_PERIOD = {
  Upcoming: 'upcoming',
  Past: 'past',
} as const;

export type MeetingPeriod = ValueOf<typeof MEETING_PERIOD>;

export function parseMeetingPeriod(raw: string): Result<MeetingPeriod, ValidationError> {
  const period = findConstant(valuesOf(MEETING_PERIOD), raw);
  return period === undefined
    ? err(validationError(VALIDATION_FIELD.MeetingPeriod, VALIDATION_RULE.UnknownValue))
    : ok(period);
}
