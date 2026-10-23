import { AUTHENTICATION_ERROR_CODE } from '@core/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';

import { MEETINGS_ERROR_KEYS } from '../i18n/translationKeys';

import { errorCodeOf } from './errorCode';
import { QueryFailure } from './QueryFailure';

const CODES = [
  ...valuesOf(REPOSITORY_ERROR_CODE),
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.AppLocked,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  STORAGE_ERROR_CODE.ReadFailed,
  VALIDATION_ERROR_CODE.Validation,
];

describe('errorCodeOf', () => {
  it.each(CODES)('reads %s from the failure of a use case', (code) => {
    expect(errorCodeOf(new QueryFailure({ code }))).toBe(code);
  });

  it('knows the code of every error that a screen has a text for', () => {
    expect(CODES.sort()).toEqual(Object.keys(MEETINGS_ERROR_KEYS).sort());
  });

  it.each([
    ['an Error', new Error('boom')],
    ['a string', 'boom'],
    ['undefined', undefined],
    ['null', null],
    ['an object with a code', { code: REPOSITORY_ERROR_CODE.NotFound }],
    ['a failure whose code no screen has a text for', new QueryFailure({ code: 'unheardOf' })],
    ['a failure whose code is a property of every object', new QueryFailure({ code: 'toString' })],
  ])('reads %s as unexpected, instead of failing', (_name, rejection) => {
    expect(errorCodeOf(rejection)).toBe(REPOSITORY_ERROR_CODE.Unexpected);
  });
});
