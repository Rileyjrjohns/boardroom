import { createContext, useCallback, useContext } from 'react';
import type { ReactNode } from 'react';

import { coreRetryableCodes } from '@core/application/retryableCodes';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';

import { CORE_ERROR_KEYS } from '../i18n/translationKeys';
import type { TranslationKey } from '../i18n/translationKeys';
import { errorCodeOf } from '../query/errorCode';

/**
 * What the screens know of the failures of the app: which codes they have a text for, what it is,
 * and which of them a second try can fix. The codes belong to the core and to the features (each
 * declares its own: the session codes are `auth`'s, a screen protection that failed is the
 * documents'), so the core does not list them: it declares the shape it needs and the composition
 * assembles the catalog from what everybody says (see `AppProviders`).
 */
export interface ErrorCatalog {
  /** Whether a screen has a text for a failure with this code. */
  has(code: string): boolean;
  /** The translation key of the text of this code, or the one of `unexpected` for a code with none. */
  messageKeyOf(code: string): TranslationKey;
  /** Whether asking again can fix a failure with this code. */
  isRetryableCode(code: string): boolean;
}

export interface ErrorCatalogParts {
  /** The text of each code a screen can tell, by code. It must tell `unexpected`. */
  readonly messageKeys: Readonly<Record<string, TranslationKey>>;
  readonly isRetryableCode: (code: string) => boolean;
}

export function createErrorCatalog({
  messageKeys,
  isRetryableCode,
}: ErrorCatalogParts): ErrorCatalog {
  const has = (code: string): boolean => Object.prototype.hasOwnProperty.call(messageKeys, code);
  const fallback = messageKeys[REPOSITORY_ERROR_CODE.Unexpected];
  return {
    has,
    messageKeyOf: (code) =>
      (has(code) ? (messageKeys[code] ?? fallback) : fallback) ?? 'errors.unexpected',
    isRetryableCode,
  };
}

/**
 * What the core knows by itself: its own families, and the codes of its own that a second try can
 * fix. It is what a component finds without a provider.
 */
export const CORE_ERROR_CATALOG: ErrorCatalog = createErrorCatalog({
  messageKeys: CORE_ERROR_KEYS,
  isRetryableCode: (code) => coreRetryableCodes.has(code),
});

const ErrorCatalogContext = createContext<ErrorCatalog>(CORE_ERROR_CATALOG);

interface ErrorCatalogProviderProps {
  readonly catalog: ErrorCatalog;
  readonly children: ReactNode;
}

export function ErrorCatalogProvider({ catalog, children }: ErrorCatalogProviderProps) {
  return <ErrorCatalogContext.Provider value={catalog}>{children}</ErrorCatalogContext.Provider>;
}

export function useErrorCatalog(): ErrorCatalog {
  return useContext(ErrorCatalogContext);
}

/** `errorCodeOf` for the catalog of the app, for the screens. */
export function useErrorCodeOf(): (error: unknown) => string {
  const catalog = useErrorCatalog();
  return useCallback((error) => errorCodeOf(error, catalog), [catalog]);
}
