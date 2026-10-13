import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { map } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireText } from '../shared/validation';
import type { EmailAddress } from '../value-objects/EmailAddress';
import type { UserId } from '../value-objects/ids';

export const MAX_FULL_NAME_LENGTH = 200;

export interface User {
  readonly id: UserId;
  readonly fullName: string;
  readonly email: EmailAddress;
}

export interface UserInput {
  readonly id: UserId;
  readonly fullName: string;
  readonly email: EmailAddress;
}

export function createUser(input: UserInput): Result<User, ValidationError> {
  return map(
    requireText(VALIDATION_FIELD.FullName, input.fullName, MAX_FULL_NAME_LENGTH),
    (fullName) => ({
      id: input.id,
      fullName,
      email: input.email,
    }),
  );
}
