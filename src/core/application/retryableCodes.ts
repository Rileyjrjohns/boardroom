import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@core/domain/errors/ScreenProtectionError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';

/**
 * The errors that a second try can fix: the network may be back, a server fault may have passed, a
 * store may be readable again, and the platform may manage to protect the screen next time
 * (`screenProtectionFailed`: a document is opened by an action and not by a query, but its screen
 * offers the same button). Every other code says something that asking again will not change: the
 * session is gone or refused (`unauthorized`, `notAuthenticated`, `sessionExpired`), the app is
 * locked until the user unlocks it (`appLocked`), somebody else is signed in now
 * (`sessionChanged`), the item is refused to the user or does not exist (`forbidden`, `notFound`),
 * the request itself is wrong (`validation`), the platform cannot protect a screen at all
 * (`screenProtectionUnsupported`).
 */
export const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
  SCREEN_PROTECTION_ERROR_CODE.Failed,
]);

export function isRetryableCode(code: string): boolean {
  return RETRYABLE_CODES.has(code);
}
