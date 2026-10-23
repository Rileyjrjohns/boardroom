import { aDuration, unwrap } from '@testing/domain/builders';

import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';

import { isAtOrAfter, isBefore, millisBetween, parseInstant, plus } from './Instant';

const MAX_DATE_MILLIS = 8_640_000_000_000_000;

function instant(epochMillis: number) {
  return unwrap(parseInstant(epochMillis));
}

describe('parseInstant', () => {
  it('accepts whole milliseconds since the epoch, bounds included', () => {
    expect(parseInstant(0)).toEqual(ok(0));
    expect(parseInstant(1_900_000_000_000)).toEqual(ok(1_900_000_000_000));
    expect(parseInstant(MAX_DATE_MILLIS)).toEqual(ok(MAX_DATE_MILLIS));
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p as not an integer', (value) => {
    expect(parseInstant(value)).toEqual(
      err(validationError(VALIDATION_FIELD.Instant, VALIDATION_RULE.NotAnInteger)),
    );
  });

  it.each([-1, MAX_DATE_MILLIS + 1])('rejects %p as out of range', (value) => {
    expect(parseInstant(value)).toEqual(
      err(validationError(VALIDATION_FIELD.Instant, VALIDATION_RULE.OutOfRange)),
    );
  });

  it('gives an instant that is always a valid Date', () => {
    expect(Number.isNaN(new Date(instant(MAX_DATE_MILLIS)).getTime())).toBe(false);
  });

  it('serialises as a plain number', () => {
    expect(JSON.stringify({ at: instant(1000) })).toBe('{"at":1000}');
  });
});

describe('comparison', () => {
  const earlier = instant(1000);
  const later = instant(2000);

  it('orders two instants', () => {
    expect(isBefore(earlier, later)).toBe(true);
    expect(isBefore(later, earlier)).toBe(false);
  });

  it('treats the same instant as neither before nor after, but as at-or-after', () => {
    expect(isBefore(earlier, earlier)).toBe(false);
    expect(isAtOrAfter(earlier, earlier)).toBe(true);
    expect(isAtOrAfter(later, earlier)).toBe(true);
    expect(isAtOrAfter(earlier, later)).toBe(false);
  });
});

describe('plus', () => {
  it('shifts an instant forward by a duration', () => {
    expect(plus(instant(1000), aDuration(500))).toEqual(ok(1500));
    expect(plus(instant(1000), aDuration(0))).toEqual(ok(1000));
  });

  it('fails when the result leaves the supported range', () => {
    expect(plus(instant(MAX_DATE_MILLIS), aDuration(1))).toEqual(
      err(validationError(VALIDATION_FIELD.Instant, VALIDATION_RULE.OutOfRange)),
    );
  });
});

describe('millisBetween', () => {
  it('is signed', () => {
    expect(millisBetween(instant(1000), instant(3500))).toBe(2500);
    expect(millisBetween(instant(3500), instant(1000))).toBe(-2500);
    expect(millisBetween(instant(1000), instant(1000))).toBe(0);
  });
});
