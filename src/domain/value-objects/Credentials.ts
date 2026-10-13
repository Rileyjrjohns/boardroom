import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { andThen, err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';

import { parseEmailAddress } from './EmailAddress';
import type { EmailAddress } from './EmailAddress';

/**
 * What a user types to sign in. The password is kept exactly as typed (no trimming) and must never
 * be logged, stored or put in an error.
 */
export interface Credentials {
  readonly email: EmailAddress;
  readonly password: string;
}

export function createCredentials(
  rawEmail: string,
  password: string,
): Result<Credentials, ValidationError> {
  return andThen(parseEmailAddress(rawEmail), (email) =>
    password.length === 0
      ? err(validationError(VALIDATION_FIELD.Password, VALIDATION_RULE.Required))
      : ok({ email, password }),
  );
}
