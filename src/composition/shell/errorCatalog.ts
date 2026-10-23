import { createErrorCatalog } from '@core/presentation/errors/ErrorCatalog';
import { CORE_ERROR_KEYS } from '@core/presentation/i18n/translationKeys';
import { SESSION_ERROR_KEYS } from '@features/auth/presentation/i18n/authMessageKeys';

import { isRetryableCode } from '../glue/retryableCodes';

/**
 * What the screens know of the failures of the app, put together: the texts of the failures of the
 * core and of the session (`auth` declares the second, the core the first), and which codes a
 * second try can fix (what the core and the features each say of their own codes, assembled in
 * `glue/retryableCodes.ts`). The core and the features declare what they say; this is the one
 * place that sees them all, and the shared components read it through the context
 * (`ErrorCatalogProvider`).
 */
export const ERROR_CATALOG = createErrorCatalog({
  messageKeys: { ...CORE_ERROR_KEYS, ...SESSION_ERROR_KEYS },
  isRetryableCode,
});
