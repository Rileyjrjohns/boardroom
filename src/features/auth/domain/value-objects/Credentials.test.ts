import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { anEmail } from '@testing/domain/builders';

import { createCredentials } from './Credentials';

describe('createCredentials', () => {
  it('validates the email and keeps the password exactly as typed', () => {
    expect(createCredentials(' Alice@Example.com ', '  secret  ')).toEqual(
      ok({ email: anEmail('alice@example.com'), password: '  secret  ' }),
    );
  });

  it('rejects a bad email', () => {
    expect(createCredentials('alice', 'secret')).toEqual(
      err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.InvalidFormat)),
    );
  });

  it('rejects an empty password', () => {
    expect(createCredentials('alice@example.com', '')).toEqual(
      err(validationError(VALIDATION_FIELD.Password, VALIDATION_RULE.Required)),
    );
  });

  it('reports the email first when both are wrong', () => {
    expect(createCredentials('', '')).toEqual(
      err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.Required)),
    );
  });
});
