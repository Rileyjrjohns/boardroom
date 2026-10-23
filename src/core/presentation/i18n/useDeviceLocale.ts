import { useLocales } from 'expo-localization';

import type { SupportedLanguage } from './constants';
import { pickLocaleTag } from './localeTag';
import { resolveLanguage } from './resolveLanguage';

/** The language the app is shown in, and the locale to format dates and numbers for. */
export interface DeviceLocale {
  readonly language: SupportedLanguage;
  /** The full tag of the device when it is in `language` (`en-GB`), the bare language otherwise. */
  readonly localeTag: string;
}

/**
 * The supported language that best matches the device settings, or `forcedLanguage` when one is
 * given, and the locale to format for. It re-renders the caller when the user changes the
 * language of the device or of the app (per-app language settings).
 */
export function useDeviceLocale(forcedLanguage?: SupportedLanguage): DeviceLocale {
  const tags = useLocales().map((locale) => locale.languageTag);
  const language = forcedLanguage ?? resolveLanguage(tags);
  return { language, localeTag: pickLocaleTag(language, tags) };
}
