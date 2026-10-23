import type { ParseKeys } from 'i18next';

import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import type { StorageReadFailedError } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import type { ValidationError } from '@core/domain/errors/ValidationError';

/** A key the typed `t` accepts: the keys of the English resource. */
export type TranslationKey = ParseKeys;

// The domain and the application speak in codes (a role, a status, an error code) and carry no
// text. The maps where a code becomes a translation key are declared by the feature that owns the
// codes (`presentation/i18n` of each feature); the core keeps the ones of its own families. Each is
// typed over the whole set of its codes, so a code added to the domain without a text fails the
// typecheck, and `as const satisfies` keeps each value a literal key, which is what `t` wants. A test
// checks that every key exists in every language.

/** The failures of the core that a screen tells: reading a source, reading a store, building a request. */
export type CoreErrorCode = (RepositoryError | StorageReadFailedError | ValidationError)['code'];

/** What each failure of the core says, the same on every screen. */
export const CORE_ERROR_KEYS = {
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unauthorized]: 'errors.unauthorized',
  [REPOSITORY_ERROR_CODE.Forbidden]: 'errors.forbidden',
  [REPOSITORY_ERROR_CODE.NotFound]: 'errors.notFound',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [VALIDATION_ERROR_CODE.Validation]: 'errors.validation',
} as const satisfies Record<CoreErrorCode, TranslationKey>;
