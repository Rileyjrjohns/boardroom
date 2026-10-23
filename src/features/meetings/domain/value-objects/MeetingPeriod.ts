import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { findConstant, valuesOf } from '@core/domain/shared/constants';
import type { ValueOf } from '@core/domain/shared/constants';

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
