import { MILLIS_PER_DAY, NOW, after } from '@testing/domain/builders';

import { createFormatters } from './formatters';

// 2030-03-17T17:46:40Z, a Sunday. Every test names a time zone, so that the text is the same on
// every machine. Spaces are normalised: the engine may use a narrow no-break space before AM/PM.
const normalise = (text: string): string => text.replace(/[ \u00a0]/g, ' ');

describe('createFormatters', () => {
  describe('in English', () => {
    const formatters = createFormatters('en', 'UTC');

    it('writes the weekday, the date and the time in a compact form', () => {
      expect(normalise(formatters.dateTime(NOW))).toMatch(/^Sun, Mar 17, 2030(,| at) 05:46 PM$/);
    });

    it('writes the complete weekday and month in the full form', () => {
      expect(normalise(formatters.fullDateTime(NOW))).toMatch(
        /^Sunday, March 17, 2030(,| at) 05:46 PM$/,
      );
    });
  });

  describe('in French', () => {
    const formatters = createFormatters('fr', 'UTC');

    it('writes the date and the time the French way', () => {
      expect(normalise(formatters.dateTime(NOW))).toMatch(/^dim\.? 17 mars 2030(,| à) 17:46$/);
    });

    it('writes the complete weekday and month in the full form', () => {
      expect(normalise(formatters.fullDateTime(NOW))).toMatch(
        /^dimanche 17 mars 2030(,| à) 17:46$/,
      );
    });
  });

  describe('for the region of the device', () => {
    it('writes the day before the month and a 24 hour clock for British English', () => {
      const british = createFormatters('en-GB', 'UTC');

      expect(normalise(british.dateTime(NOW))).toMatch(/^Sun,? 17 Mar 2030(,| at) 17:46$/);
      expect(normalise(british.fullDateTime(NOW))).toMatch(/^Sunday,? 17 March 2030(,| at) 17:46$/);
    });

    it('writes the month before the day and a 12 hour clock for the English of the United States', () => {
      expect(normalise(createFormatters('en-US', 'UTC').dateTime(NOW))).toMatch(
        /^Sun, Mar 17, 2030(,| at) 05:46 PM$/,
      );
    });

    it('differs from the bare language where the region changes the writing', () => {
      expect(createFormatters('en-GB', 'UTC').dateTime(NOW)).not.toBe(
        createFormatters('en', 'UTC').dateTime(NOW),
      );
    });
  });

  describe('numbers', () => {
    it('groups the digits as the locale does', () => {
      expect(createFormatters('en').number(1_234_567)).toBe('1,234,567');
      expect(normalise(createFormatters('fr').number(1_234_567))).toBe('1 234 567');
      expect(createFormatters('en').number(12)).toBe('12');
    });

    it('writes a number the way the region does, not only the language', () => {
      expect(normalise(createFormatters('fr-CH').number(1_234_567))).not.toBe(
        normalise(createFormatters('fr').number(1_234_567)),
      );
    });
  });

  it('formats the same instant differently in the two languages', () => {
    expect(createFormatters('en', 'UTC').dateTime(NOW)).not.toBe(
      createFormatters('fr', 'UTC').dateTime(NOW),
    );
  });

  it('shows the time of the zone it is given: the instant does not change, the clock on the wall does', () => {
    const paris = createFormatters('fr', 'Europe/Paris');
    const tokyo = createFormatters('fr', 'Asia/Tokyo');

    // Paris is one hour ahead of UTC on that date (summer time starts two weeks later).
    expect(normalise(paris.dateTime(NOW))).toContain('18:46');
    expect(normalise(tokyo.dateTime(NOW))).toContain('02:46');
    expect(normalise(tokyo.dateTime(NOW))).toContain('18 mars');
  });

  it('uses the time zone of the device when none is given', () => {
    const device = createFormatters('en');
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
    const formatters = createFormatters('en', 'UTC');

    expect(formatters.dateTime(NOW)).toBe(formatters.dateTime(NOW));
    expect(normalise(formatters.dateTime(after(NOW, MILLIS_PER_DAY * 365)))).toContain('2031');
  });
});
