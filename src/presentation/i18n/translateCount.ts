import type { TFunction } from 'i18next';

import type { en } from './resources/en';

/**
 * The plural keys of a resource, as `t` addresses them: `meetings.count` for the entries
 * `meetings.count_one`, `meetings.count_many` and `meetings.count_other`. Every plural key has an
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
 * its parameters: `t('meetings.count')` without a count, or with a count that is a string (a route
 * parameter, say), compiles and shows the raw key to the user. Here the count is a number, and
 * only plural keys are accepted.
 */
export function translateCount(t: TFunction, key: PluralKey, count: number): string {
  return t(key, { count });
}
