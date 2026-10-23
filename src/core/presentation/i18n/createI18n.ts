import { createInstance, type i18n } from 'i18next';

import { DEFAULT_NAMESPACE, FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from './constants';
import type { SupportedLanguage } from './constants';
import { installPluralRulesFallback } from './intlPluralRulesFallback';
import { copyResources } from './resources';

/**
 * Creates an initialised i18next instance, ready to be given to an `I18nextProvider`.
 *
 * A factory over `createInstance()` rather than the global i18next singleton plus the
 * `initReactI18next` plugin: every call returns an independent instance with its own copy of the
 * resources, so tests never share state or need to reset anything, and nothing runs at import
 * time. The instance reaches the components through the provider only.
 *
 * Initialisation is synchronous (`initAsync: false` and in-memory resources): `t` works as soon as
 * this function returns, so the first render is already translated.
 */
export function createI18n(language: SupportedLanguage = FALLBACK_LANGUAGE): i18n {
  installPluralRulesFallback();

  const instance = createInstance();
  void instance.init({
    lng: language,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    // A copy: i18next keeps and mutates the object it is given.
    resources: copyResources(),
    ns: [DEFAULT_NAMESPACE],
    defaultNS: DEFAULT_NAMESPACE,
    initAsync: false,
    // React Native renders text as is: there is no markup to escape against.
    interpolation: { escapeValue: false },
  });
  return instance;
}
