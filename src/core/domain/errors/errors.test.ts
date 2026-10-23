import {
  REPOSITORY_ERROR_CODE,
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from './RepositoryError';
import { STORAGE_ERROR_CODE, storageReadFailed, storageWriteFailed } from './StorageError';
import {
  VALIDATION_ERROR_CODE,
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from './ValidationError';

describe('error factories', () => {
  it('build a validation error with its field and rule', () => {
    expect(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.Required)).toEqual({
      code: VALIDATION_ERROR_CODE.Validation,
      field: VALIDATION_FIELD.Email,
      rule: VALIDATION_RULE.Required,
    });
  });

  it('build the repository errors', () => {
    expect(networkUnavailable().code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
    expect(notFound().code).toBe(REPOSITORY_ERROR_CODE.NotFound);
    expect(unauthorized().code).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
    expect(forbidden()).toEqual({ code: REPOSITORY_ERROR_CODE.Forbidden });
  });

  it('carry a technical cause only when one is given', () => {
    expect(unexpected()).toEqual({ code: REPOSITORY_ERROR_CODE.Unexpected });
    expect(unexpected('HTTP 500')).toEqual({
      code: REPOSITORY_ERROR_CODE.Unexpected,
      cause: 'HTTP 500',
    });
    expect(storageReadFailed()).toEqual({ code: STORAGE_ERROR_CODE.ReadFailed });
    expect(storageReadFailed('disk')).toEqual({
      code: STORAGE_ERROR_CODE.ReadFailed,
      cause: 'disk',
    });
    expect(storageWriteFailed()).toEqual({ code: STORAGE_ERROR_CODE.WriteFailed });
    expect(storageWriteFailed('full')).toEqual({
      code: STORAGE_ERROR_CODE.WriteFailed,
      cause: 'full',
    });
  });
});
