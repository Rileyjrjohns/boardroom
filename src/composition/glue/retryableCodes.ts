import { coreRetryableCodes } from '@core/application/retryableCodes';
import { documentsRetryableCodes } from '@features/documents/application/retryableCodes';

/**
 * The errors that a second try can fix: what the core and each feature say of their own codes, put
 * together. Every other code says something that asking again will not change: the session is gone
 * or refused (`unauthorized`, `notAuthenticated`, `sessionExpired`), the app is locked until the
 * user unlocks it (`appLocked`), somebody else is signed in now (`sessionChanged`), the item is
 * refused to the user or does not exist (`forbidden`, `notFound`), the request itself is wrong
 * (`validation`), the platform cannot protect a screen at all (`screenProtectionUnsupported`).
 *
 * The core knows no feature, so each declares its codes and the composition, which sees them all,
 * assembles the set: it is the `RETRYABLE_CODES` of the specification.
 */
export const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  ...coreRetryableCodes,
  ...documentsRetryableCodes,
]);

/** Whether asking again can fix a failure with this code. */
export function isRetryableCode(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}
