import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { resolveLanguage } from '../i18n/resolveLanguage';

import { createDateTimeFormatter } from './dateTime';
import type { DateTimeFormatter } from './dateTime';

/** The date and time formatters for the language the app is shown in right now. */
export function useDateTimeFormatter(): DateTimeFormatter {
  const { i18n } = useTranslation();
  const language = resolveLanguage([i18n.language]);
  return useMemo(() => createDateTimeFormatter(language), [language]);
}
