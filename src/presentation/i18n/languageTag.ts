const SUBTAG_SEPARATOR = /[-_]/;

/**
 * The primary language subtag of a BCP 47 language tag, lower-cased: `fr-CA` gives `fr`,
 * `en_GB` gives `en`, `zh-Hans-CN` gives `zh`. Surrounding whitespace is ignored.
 *
 * Returns an empty string for an empty tag, and for anything that is not a string: the tags come
 * from the native side of the device, and one malformed entry must not crash the app.
 */
export function primaryLanguageSubtag(languageTag: string | null | undefined): string {
  if (typeof languageTag !== 'string') return '';
  return (languageTag.trim().split(SUBTAG_SEPARATOR)[0] ?? '').toLowerCase();
}
