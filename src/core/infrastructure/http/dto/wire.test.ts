import { parseInstant } from '@core/domain/value-objects/Instant';
import { unwrap } from '@testing/domain/builders';

import { isoInstantSchema, toIsoString } from './wire';

describe('isoInstantSchema', () => {
  it.each([
    ['2030-03-17T17:46:40.000Z', 1_900_000_000_000],
    ['2030-03-17T17:46:40Z', 1_900_000_000_000],
    ['2030-03-17T17:46:40.5Z', 1_900_000_000_500],
    ['2030-03-17T17:46:40.123456789Z', 1_900_000_000_123],
    ['2030-03-17T18:46:40+01:00', 1_900_000_000_000],
    ['2030-03-17T12:46:40-05:00', 1_900_000_000_000],
    ['1970-01-01T00:00:00.000Z', 0],
    ['+275760-09-13T00:00:00.000Z', 8_640_000_000_000_000],
  ])('reads %s as %s', (text, millis) => {
    expect(isoInstantSchema.parse(text)).toBe(millis);
  });

  it.each([
    '2030-03-17',
    '2030-03-17T17:46:40',
    '2030-03-17 17:46:40Z',
    '17/03/2030',
    '1900000000000',
    'yesterday',
    '',
    '2030-13-17T17:46:40Z',
    '2030-03-32T17:46:40Z',
    '2030-03-17T25:46:40Z',
    ' 2030-03-17T17:46:40Z',
  ])('refuses %j', (text) => {
    expect(isoInstantSchema.safeParse(text).success).toBe(false);
  });

  it.each([1_900_000_000_000, 0, 8_640_000_000_000_000, 1_900_000_000_123])(
    'reads back what toIsoString wrote for %s',
    (millis) => {
      const instant = unwrap(parseInstant(millis));

      expect(isoInstantSchema.parse(toIsoString(instant))).toBe(millis);
    },
  );

  it('refuses a number: instants are strings on the wire', () => {
    expect(isoInstantSchema.safeParse(1_900_000_000_000).success).toBe(false);
  });
});
