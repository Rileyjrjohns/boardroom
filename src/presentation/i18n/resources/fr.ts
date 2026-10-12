import type { TranslationResource } from './translation';

/**
 * French resource, typed against the English one: a missing or an extra key fails the typecheck.
 *
 * French has three plural categories. `one` covers 0 and 1, so "0 réunion" is correct. `many`
 * applies to exact multiples of one million and takes a "de": "1000000 de réunions". Everything
 * else is `other`.
 */
export const fr: TranslationResource = {
  app: {
    name: 'Boardroom',
  },
  placeholder: {
    message: 'Le socle du projet est prêt.',
  },
  meetings: {
    count_one: '{{count}} réunion',
    count_many: '{{count}} de réunions',
    count_other: '{{count}} réunions',
  },
};
