import type { TFunction } from 'i18next';

import type { en } from './resources/en';

/**
 * The plural keys of a resource, as `t` addresses them: `meeting.pageCount` for the entries
 * `meeting.pageCount_one`, `meeting.pageCount_many` and `meeting.pageCount_other`. Every plural key has an
 * `_other` entry, which is how one is recognised.
 */
type PluralKeys<Resource, Prefix extends string = ''> = {
  [Key in keyof Resource & string]: Resource[Key] extends string
    ? Key extends `${infer Base}_other`
      ? `${Prefix}${Base}`
      : never
    : PluralKeys<Resource[Key], `${Prefix}${Key}.`>;
}[keyof Resource & string];

/** A translation key whose text depends on a count. */
export type PluralKey = PluralKeys<typeof en>;

/**
 * Translates a plural key for a count.
 *
 * Use it instead of calling `t` directly with a `count`. The types of `t` check the key but not
 * its parameters: `t('meeting.pageCount')` without a count, or with a count that is a string (a route
 * parameter, say), compiles and shows the raw key to the user. Here the count is a number, and
 * only plural keys are accepted.
 *
 * The count picks the plural form, and `formatNumber` (the `number` of the formatters of the
 * locale) writes it: the text of a plural key shows `{{formattedCount}}`, so that 1000 is written
 * `1,000` or `1 000` as the user's locale wants, and never `{{count}}`, which would print the raw
 * number.
 */
export function translateCount(
  t: TFunction,
  key: PluralKey,
  count: number,
  formatNumber: (value: number) => string,
): string {
  return t(key, { count, formattedCount: formatNumber(count) });
}
