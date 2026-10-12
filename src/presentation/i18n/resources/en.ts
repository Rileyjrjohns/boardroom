/**
 * English resource, and the source of truth for the set of translation keys: every other language
 * is typed against its shape (see `translation.ts`).
 *
 * Plural keys follow the i18next convention: one entry per plural category, suffixed with `_one`,
 * `_many`, `_other`, and so on. Every plural key lists the categories of every supported language,
 * because the other languages are typed against this shape. English itself only selects `one`
 * and `other`: its `_many` entry is never shown, it exists for the French resource.
 */
export const en = {
  app: {
    name: 'Boardroom',
  },
  placeholder: {
    message: 'Project scaffold is ready.',
  },
  meetings: {
    count_one: '{{count}} meeting',
    count_many: '{{count}} meetings',
    count_other: '{{count}} meetings',
  },
} as const;
