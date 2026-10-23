import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';

import { coreRetryableCodes } from './retryableCodes';

describe('the codes of the core a second try can fix', () => {
  it('are the network, a fault of the server and a store that could not be read', () => {
    expect([...coreRetryableCodes].sort()).toEqual(
      [
        REPOSITORY_ERROR_CODE.NetworkUnavailable,
        REPOSITORY_ERROR_CODE.Unexpected,
        STORAGE_ERROR_CODE.ReadFailed,
      ].sort(),
    );
  });

  it.each([
    REPOSITORY_ERROR_CODE.Unauthorized,
    REPOSITORY_ERROR_CODE.Forbidden,
    REPOSITORY_ERROR_CODE.NotFound,
    STORAGE_ERROR_CODE.WriteFailed,
    VALIDATION_ERROR_CODE.Validation,
  ])('leave out %s: asking again cannot change it', (code) => {
    expect(coreRetryableCodes.has(code)).toBe(false);
  });
});
