import type { SupportedLanguage } from './constants';
import { primaryLanguageSubtag } from './languageTag';

/**
 * The tag in its canonical form (`en_gb` gives `en-GB`), or `undefined` when it is not a
 * well-formed language tag. The tags come from the native side of the device, and `Intl` throws
 * when it is given a malformed one.
 */
function canonicalLocaleTag(languageTag: string | null | undefined): string | undefined {
  if (typeof languageTag !== 'string') return undefined;
  try {
    return Intl.getCanonicalLocales(languageTag.trim().replace(/_/g, '-'))[0];
  } catch {
    return undefined;
  }
}

/**
 * The locale to format dates and numbers for, given the language the app is shown in and the
 * language tags of the device, most preferred first. When a tag of the device is in that language,
 * its full form wins (`en-GB` for an English app on a British device: day before month, 24 hour
 * clock), because the region is what the user chose for how things are written. Otherwise the bare
 * language is used: the app is shown in a language the device does not have as its own (a forced
 * language, or the fallback), so no region of the device applies. A malformed tag is skipped.
 *
 * Pure: the device is read elsewhere (see `useDeviceLocale`).
 */
export function pickLocaleTag(
  language: SupportedLanguage,
  deviceLanguageTags: readonly (string | null | undefined)[],
): string {
  for (const deviceTag of deviceLanguageTags) {
    const tag = canonicalLocaleTag(deviceTag);
    if (tag !== undefined && primaryLanguageSubtag(tag) === language) return tag;
  }
  return language;
}
