import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES, type SupportedLanguage } from './constants';
import { primaryLanguageSubtag } from './languageTag';

/**
 * The supported language for a primary language subtag, or `undefined` when it is not supported.
 * Searching the constant list instead of casting keeps the result typed.
 */
export function findSupportedLanguage(subtag: string): SupportedLanguage | undefined {
  return SUPPORTED_LANGUAGES.find((language) => language === subtag);
}

/**
 * Picks the app language from the device language tags, given in the order of preference of the
 * user (`['fr-CA', 'en-US']`). The first tag whose language is supported wins, whatever its region
 * (`fr-CA` and `fr-FR` are both `fr`). When no tag matches, or the list is empty, the fallback
 * language is returned. An entry that is not a usable string (`null`, `undefined`, an empty tag)
 * is skipped.
 *
 * Pure: the device is read elsewhere (see `useDeviceLanguage`).
 */
export function resolveLanguage(
  deviceLanguageTags: readonly (string | null | undefined)[],
): SupportedLanguage {
  for (const languageTag of deviceLanguageTags) {
    const language = findSupportedLanguage(primaryLanguageSubtag(languageTag));
    if (language !== undefined) return language;
  }
  return FALLBACK_LANGUAGE;
}
