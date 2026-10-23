import type { Instant } from '@core/domain/value-objects/Instant';

/** Dates, times and numbers as the user reads them, for their locale. */
export interface Formatters {
  /** Compact: weekday, day, month, year and time. For rows, banners and closing times. */
  dateTime(instant: Instant): string;
  /** Complete: the whole weekday and month, and the time. For the header of a meeting. */
  fullDateTime(instant: Instant): string;
  /** A number with the grouping of the locale (`1,000` or `1 000`). For counts. */
  number(value: number): string;
}

const COMPACT_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const FULL_OPTIONS: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

/**
 * Formatters for a locale (`en`, `en-GB`, `fr-CA`), from `Intl`. The locale decides the order of
 * the day and the month, the 12 or 24 hour clock and the grouping of digits, which is why the app
 * gives it the full tag of the device when the language of the device is the one shown (see
 * `pickLocaleTag`). Creating a formatter is the expensive part of formatting, so they are made
 * once per locale and shared (see `FormattersProvider`), not once per component.
 *
 * The domain holds an `Instant` and no time zone; the zone is the one of the device, unless a
 * `timeZone` is given, which is what the tests do to get the same text on every machine.
 *
 * `new Date(instant)` is a conversion, not a read of the clock: an `Instant` never leaves the range
 * of a `Date`.
 */
export function createFormatters(locale: string, timeZone?: string): Formatters {
  const zone = timeZone === undefined ? {} : { timeZone };
  const compact = new Intl.DateTimeFormat(locale, { ...COMPACT_OPTIONS, ...zone });
  const full = new Intl.DateTimeFormat(locale, { ...FULL_OPTIONS, ...zone });
  const numbers = new Intl.NumberFormat(locale);
  return {
    dateTime: (instant) => compact.format(new Date(instant)),
    fullDateTime: (instant) => full.format(new Date(instant)),
    number: (value) => numbers.format(value),
  };
}
