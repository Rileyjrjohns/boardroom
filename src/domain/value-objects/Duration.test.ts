import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';

import { durationFromMillis } from './Duration';

describe('Duration', () => {
  it('accepts a whole, non-negative number of milliseconds', () => {
    expect(durationFromMillis(0)).toEqual(ok(0));
    expect(durationFromMillis(1500)).toEqual(ok(1500));
  });

  it('rejects a fraction of a millisecond', () => {
    expect(durationFromMillis(0.5)).toEqual(
      err(validationError(VALIDATION_FIELD.Duration, VALIDATION_RULE.NotAnInteger)),
    );
  });

  it('rejects a negative or an absurdly long duration', () => {
    const outOfRange = err(validationError(VALIDATION_FIELD.Duration, VALIDATION_RULE.OutOfRange));

    expect(durationFromMillis(-1)).toEqual(outOfRange);
    expect(durationFromMillis(3_153_600_000_001)).toEqual(outOfRange);
  });
});
