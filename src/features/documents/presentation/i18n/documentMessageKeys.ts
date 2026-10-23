import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import type { ScreenCaptureKind } from '@features/documents/application/ports/ScreenProtection';
import type { OpenDocumentError } from '@features/documents/application/use-cases/OpenDocument';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';

// The domain and the application speak in codes (an error code, a kind of capture) and carry no
// text. These maps are where a code of the documents becomes a translation key. Each is typed over
// the whole set of its codes, so a code added to the domain without a text fails the typecheck, and
// `as const satisfies` keeps each value a literal key, which is what `t` wants. A test checks that
// every key exists in every language.

/** Every way opening a document can fail. */
export type DocumentErrorCode = OpenDocumentError['code'];

/**
 * What the screen of a document says when it cannot show it. `networkUnavailable` is told apart on
 * purpose: opening a document is the one place where it means the document is not on the device, so
 * the user is told why it cannot be read offline and not just that the server is out of reach. A
 * document that does not exist or that the user may not have is told as a document, not as a
 * meeting.
 */
export const DOCUMENT_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'document.errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unauthorized]: 'errors.unauthorized',
  [REPOSITORY_ERROR_CODE.Forbidden]: 'document.errors.forbidden',
  [REPOSITORY_ERROR_CODE.NotFound]: 'document.notFound',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [SCREEN_PROTECTION_ERROR_CODE.Unsupported]: 'document.errors.screenProtectionUnsupported',
  [SCREEN_PROTECTION_ERROR_CODE.Failed]: 'document.errors.screenProtectionFailed',
} as const satisfies Record<DocumentErrorCode, TranslationKey>;

/**
 * What the screen of a document says when the system reports a capture. The end of a recording
 * says nothing new: the capture was told when it began, and the notice stays.
 */
export const CAPTURE_NOTICE_KEYS = {
  [SCREEN_CAPTURE_KIND.ScreenshotTaken]: 'document.capture.screenshot',
  [SCREEN_CAPTURE_KIND.RecordingStarted]: 'document.capture.recording',
  [SCREEN_CAPTURE_KIND.RecordingStopped]: undefined,
} as const satisfies Record<ScreenCaptureKind, TranslationKey | undefined>;
