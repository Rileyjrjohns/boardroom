import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';

import { MEETING_PERIOD, parseMeetingPeriod } from './MeetingPeriod';

describe('MeetingPeriod', () => {
  it.each(Object.values(MEETING_PERIOD))('parses %s', (period) => {
    expect(parseMeetingPeriod(period)).toEqual(ok(period));
  });

  it('rejects anything else', () => {
    expect(parseMeetingPeriod('future')).toEqual(
      err(validationError(VALIDATION_FIELD.MeetingPeriod, VALIDATION_RULE.UnknownValue)),
    );
  });
});
