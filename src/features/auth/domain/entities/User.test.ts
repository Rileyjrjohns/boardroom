import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { aUserId, anEmail } from '@testing/domain/builders';

import { createUser } from './User';

describe('createUser', () => {
  it('builds a user with a trimmed name', () => {
    expect(createUser({ id: aUserId(), fullName: '  Alice Martin ', email: anEmail() })).toEqual(
      ok({ id: aUserId(), fullName: 'Alice Martin', email: anEmail() }),
    );
  });

  it('rejects a blank name and a name that is too long', () => {
    expect(createUser({ id: aUserId(), fullName: ' ', email: anEmail() })).toEqual(
      err(validationError(VALIDATION_FIELD.FullName, VALIDATION_RULE.Required)),
    );
    expect(createUser({ id: aUserId(), fullName: 'a'.repeat(201), email: anEmail() })).toEqual(
      err(validationError(VALIDATION_FIELD.FullName, VALIDATION_RULE.TooLong)),
    );
  });
});
