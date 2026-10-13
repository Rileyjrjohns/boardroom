import { MILLIS_PER_DAY, NOW, after } from '@domain/testing/builders';

import { createDateTimeFormatter } from './dateTime';

// 2030-03-17T17:46:40Z, a Sunday. Every test names a time zone, so that the text is the same on
// every machine. Spaces are normalised: the engine may use a narrow no-break space before AM/PM.
const normalise = (text: string): string => text.replace(/[  ]/g, ' ');

describe('createDateTimeFormatter', () => {
  describe('in English', () => {
    const formatter = createDateTimeFormatter('en', 'UTC');

    it('writes the weekday, the date and the time in a compact form', () => {
      expect(normalise(formatter.dateTime(NOW))).toMatch(/^Sun, Mar 17, 2030(,| at) 05:46 PM$/);
    });

    it('writes the complete weekday and month in the full form', () => {
      expect(normalise(formatter.fullDateTime(NOW))).toMatch(
        /^Sunday, March 17, 2030(,| at) 05:46 PM$/,
      );
    });
  });

  describe('in French', () => {
    const formatter = createDateTimeFormatter('fr', 'UTC');

    it('writes the date and the time the French way', () => {
      expect(normalise(formatter.dateTime(NOW))).toMatch(/^dim\.? 17 mars 2030(,| à) 17:46$/);
    });

    it('writes the complete weekday and month in the full form', () => {
      expect(normalise(formatter.fullDateTime(NOW))).toMatch(/^dimanche 17 mars 2030(,| à) 17:46$/);
    });
  });

  it('formats the same instant differently in the two languages', () => {
    expect(createDateTimeFormatter('en', 'UTC').dateTime(NOW)).not.toBe(
      createDateTimeFormatter('fr', 'UTC').dateTime(NOW),
    );
  });

  it('shows the time of the zone it is given: the instant does not change, the clock on the wall does', () => {
    const paris = createDateTimeFormatter('fr', 'Europe/Paris');
    const tokyo = createDateTimeFormatter('fr', 'Asia/Tokyo');

    // Paris is one hour ahead of UTC on that date (summer time starts two weeks later).
    expect(normalise(paris.dateTime(NOW))).toContain('18:46');
    expect(normalise(tokyo.dateTime(NOW))).toContain('02:46');
    expect(normalise(tokyo.dateTime(NOW))).toContain('18 mars');
  });

  it('uses the time zone of the device when none is given', () => {
    const device = createDateTimeFormatter('en');
    const expected = new Intl.DateTimeFormat('en', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(NOW));

    expect(device.dateTime(NOW)).toBe(expected);
  });

  it('formats the instant given, not the present', () => {
    const formatter = createDateTimeFormatter('en', 'UTC');

    expect(formatter.dateTime(NOW)).toBe(formatter.dateTime(NOW));
    expect(normalise(formatter.dateTime(after(NOW, MILLIS_PER_DAY * 365)))).toContain('2031');
  });
});
