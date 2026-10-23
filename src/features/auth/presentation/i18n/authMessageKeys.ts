import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE, VALIDATION_RULE } from '@core/domain/errors/ValidationError';
import type { ValidationRule } from '@core/domain/errors/ValidationError';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import type { BiometricReason } from '@features/auth/application/ports/BiometricGate';
import type { SessionEndingCode } from '@features/auth/application/session/sessionPolicy';
import type { SessionRequiredError } from '@features/auth/application/session/requireSession';
import type { SignInError } from '@features/auth/application/use-cases/SignIn';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import type { SessionChangedError } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import type { BiometricError } from '@features/auth/domain/errors/BiometricError';

// The domain and the application speak in codes (a role, a status, an error code) and carry no
// text. These maps are where a code of the session becomes a translation key. Each is typed over
// the whole set of its codes, so a code added to the domain without a text fails the typecheck, and
// `as const satisfies` keeps each value a literal key, which is what `t` wants. A test checks that
// every key exists in every language.

/** The failures of the session guard that are the session's own: the others are the core's. */
export type SessionErrorCode = Exclude<
  (SessionRequiredError | SessionChangedError)['code'],
  typeof STORAGE_ERROR_CODE.ReadFailed
>;

/**
 * What the failures of the session say, on every screen that can meet them (a screen of the open
 * app shows them as the error of what it was loading; the sign-in and lock screens show them as
 * the reason the user was sent back).
 */
export const SESSION_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
} as const satisfies Record<SessionErrorCode, TranslationKey>;

/**
 * Why the user was sent back to the sign-in or the lock screen: a failure that ends the session
 * (see `SESSION_ENDING_CODES`), told the way it is told anywhere else.
 */
export const SESSION_ENDED_KEYS = {
  [REPOSITORY_ERROR_CODE.Unauthorized]: 'errors.unauthorized',
  ...SESSION_ERROR_KEYS,
} as const satisfies Record<SessionEndingCode, TranslationKey>;

/** The text of the system prompt that asks for a biometric proof, for each reason. */
export const BIOMETRIC_PROMPT_KEYS = {
  [BIOMETRIC_REASON.UnlockApp]: 'biometric.unlockApp',
  [BIOMETRIC_REASON.ConfirmVote]: 'biometric.confirmVote',
} as const satisfies Record<BiometricReason, TranslationKey>;

/** What a sign-in that was refused says. A badly formed field is told next to the field instead. */
export const SIGN_IN_ERROR_KEYS = {
  [VALIDATION_ERROR_CODE.Validation]: 'errors.validation',
  [AUTHENTICATION_ERROR_CODE.InvalidCredentials]: 'errors.invalidCredentials',
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [STORAGE_ERROR_CODE.WriteFailed]: 'errors.storageWriteFailed',
} as const satisfies Record<SignInError['code'], TranslationKey>;

// What the domain says about a field of the sign-in form is a rule that the value broke. The
// email can break all of them that apply to a text or to a format; the password can only be empty.
// The rules that cannot concern a field of text are mapped to the nearest message, so that the
// maps stay exhaustive: a rule added to the domain without a message fails the typecheck here.

export const EMAIL_RULE_KEYS = {
  [VALIDATION_RULE.Required]: 'signIn.emailRequired',
  [VALIDATION_RULE.TooLong]: 'signIn.emailTooLong',
  [VALIDATION_RULE.InvalidFormat]: 'signIn.emailInvalid',
  [VALIDATION_RULE.NotAnInteger]: 'signIn.emailInvalid',
  [VALIDATION_RULE.OutOfRange]: 'signIn.emailInvalid',
  [VALIDATION_RULE.UnknownValue]: 'signIn.emailInvalid',
  [VALIDATION_RULE.Duplicate]: 'signIn.emailInvalid',
} as const satisfies Record<ValidationRule, TranslationKey>;

export const PASSWORD_RULE_KEYS = {
  [VALIDATION_RULE.Required]: 'signIn.passwordRequired',
  [VALIDATION_RULE.TooLong]: 'signIn.passwordRequired',
  [VALIDATION_RULE.InvalidFormat]: 'signIn.passwordRequired',
  [VALIDATION_RULE.NotAnInteger]: 'signIn.passwordRequired',
  [VALIDATION_RULE.OutOfRange]: 'signIn.passwordRequired',
  [VALIDATION_RULE.UnknownValue]: 'signIn.passwordRequired',
  [VALIDATION_RULE.Duplicate]: 'signIn.passwordRequired',
} as const satisfies Record<ValidationRule, TranslationKey>;

/**
 * The code of a failure that is not an error of the use case an action called (a bug rejects with
 * something else): the actions read it as `unexpected`, so their maps carry it next to the codes of
 * their use case.
 */
type OrUnexpected<Code extends string> = Code | typeof REPOSITORY_ERROR_CODE.Unexpected;

/** What each outcome of the biometric prompt says on the lock screen. */
export const UNLOCK_ERROR_KEYS = {
  [BIOMETRIC_ERROR_CODE.Unavailable]: 'unlockErrors.biometricUnavailable',
  [BIOMETRIC_ERROR_CODE.NotEnrolled]: 'unlockErrors.biometricNotEnrolled',
  [BIOMETRIC_ERROR_CODE.Cancelled]: 'unlockErrors.biometricCancelled',
  [BIOMETRIC_ERROR_CODE.Failed]: 'unlockErrors.biometricFailed',
  [BIOMETRIC_ERROR_CODE.LockedOut]: 'unlockErrors.biometricLockedOut',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
} as const satisfies Record<OrUnexpected<BiometricError['code']>, TranslationKey>;
