/**
 * Languages the app is translated into. This is the single source of truth: the resources, the
 * device language detection and the plural rules all derive from it. Adding a language starts
 * here, and the type system then demands a matching resource and plural rule. `app.config.ts`
 * cannot import this file and keeps a copy for the native per-app language settings: a test fails
 * when the two drift apart.
 */
export const SUPPORTED_LANGUAGES = ['en', 'fr'] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Language used when the device language is not supported, and for any missing translation. */
export const FALLBACK_LANGUAGE: SupportedLanguage = 'en';

/** The only i18next namespace. Keys are grouped by area inside it, for example `navigation.meetings`. */
export const DEFAULT_NAMESPACE = 'translation';
