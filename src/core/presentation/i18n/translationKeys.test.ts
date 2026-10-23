import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';
import { describeTranslationMaps } from '@testing/presentation/translationMaps';

import { CORE_ERROR_KEYS } from './translationKeys';

// The maps from codes to translation keys are declared by the feature that owns the codes (see
// `presentation/i18n` of each feature); the core keeps the ones of its own families.

describeTranslationMaps({
  CORE_ERROR_KEYS: [
    CORE_ERROR_KEYS,
    [
      ...valuesOf(REPOSITORY_ERROR_CODE),
      STORAGE_ERROR_CODE.ReadFailed,
      VALIDATION_ERROR_CODE.Validation,
    ],
  ],
});
