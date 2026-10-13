import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { createFormatters } from './formatters';
import type { Formatters } from './formatters';

const FormattersContext = createContext<Formatters | undefined>(undefined);

interface FormattersProviderProps {
  /** The locale to format for: `en`, or the full tag of the device such as `en-GB`. */
  readonly locale: string;
  readonly children: ReactNode;
}

/**
 * Provides the formatters of a locale to the tree below. They are created once per locale, here,
 * and shared by every component that formats something: a new set is made only when the locale
 * changes, not for each row or each render.
 */
export function FormattersProvider({ locale, children }: FormattersProviderProps) {
  const formatters = useMemo(() => createFormatters(locale), [locale]);
  return <FormattersContext.Provider value={formatters}>{children}</FormattersContext.Provider>;
}

/** The formatters for the locale the app is shown in. */
export function useFormatters(): Formatters {
  const formatters = useContext(FormattersContext);
  if (formatters === undefined) {
    throw new Error('useFormatters must be used inside a FormattersProvider.');
  }
  return formatters;
}
