import { useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import type { SupportedLanguage } from './constants';
import { createI18n } from './createI18n';
import { useDeviceLanguage } from './useDeviceLanguage';

interface I18nProviderProps {
  readonly children: ReactNode;
  /**
   * Forces a language instead of following the device. Meant for tests and for a future in-app
   * language setting.
   */
  readonly language?: SupportedLanguage;
}

/**
 * Provides the translations to the component tree. The i18next instance is created once, on the
 * first render, in the language of the device (or the forced one), and follows later changes of
 * that language.
 */
export function I18nProvider({ children, language }: I18nProviderProps) {
  const deviceLanguage = useDeviceLanguage();
  const activeLanguage = language ?? deviceLanguage;
  const [i18n] = useState(() => createI18n(activeLanguage));

  useEffect(() => {
    if (i18n.language !== activeLanguage) void i18n.changeLanguage(activeLanguage);
  }, [i18n, activeLanguage]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
