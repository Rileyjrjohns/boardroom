import type { Instant } from '@domain/value-objects/Instant';

import type { SupportedLanguage } from '../i18n/constants';

/** Dates and times as the user reads them, in their language. */
export interface DateTimeFormatter {
  /** Compact: weekday, day, month, year and time. For rows, banners and closing times. */
  dateTime(instant: Instant): string;
  /** Complete: the whole weekday and month, and the time. For the header of a meeting. */
  fullDateTime(instant: Instant): string;
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
 * Formatters for a language, from `Intl.DateTimeFormat`. The domain holds an `Instant` and no time
 * zone; the zone is the one of the device, unless a `timeZone` is given, which is what the tests
 * do to get the same text on every machine.
 *
 * `new Date(instant)` is a conversion, not a read of the clock: an `Instant` never leaves the range
 * of a `Date`.
 */
export function createDateTimeFormatter(
  language: SupportedLanguage,
  timeZone?: string,
): DateTimeFormatter {
  const zone = timeZone === undefined ? {} : { timeZone };
  const compact = new Intl.DateTimeFormat(language, { ...COMPACT_OPTIONS, ...zone });
  const full = new Intl.DateTimeFormat(language, { ...FULL_OPTIONS, ...zone });
  return {
    dateTime: (instant) => compact.format(new Date(instant)),
    fullDateTime: (instant) => full.format(new Date(instant)),
  };
}
