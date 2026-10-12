import { useLocales } from 'expo-localization';

import type { SupportedLanguage } from './constants';
import { resolveLanguage } from './resolveLanguage';

/**
 * The supported language that best matches the device settings. It re-renders the caller when the
 * user changes the language of the device or of the app (per-app language settings).
 */
export function useDeviceLanguage(): SupportedLanguage {
  return resolveLanguage(useLocales().map((locale) => locale.languageTag));
}
