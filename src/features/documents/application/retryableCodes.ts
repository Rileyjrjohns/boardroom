import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';

/**
 * The errors of the documents that a second try can fix: the platform may manage to protect the
 * screen next time (`screenProtectionFailed`: a document is opened by an action and not by a query,
 * but its screen offers the same button). The platform that cannot protect a screen at all
 * (`screenProtectionUnsupported`) will not be able to the next time either.
 *
 * The composition adds them to those of the core (see `RETRYABLE_CODES` in
 * `src/composition/glue/retryableCodes.ts`).
 */
export const documentsRetryableCodes: ReadonlySet<string> = new Set([
  SCREEN_PROTECTION_ERROR_CODE.Failed,
]);
