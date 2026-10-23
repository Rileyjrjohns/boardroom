import { VALIDATION_FIELD } from '@core/domain/errors/ValidationError';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import { map } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { requireText } from '@core/domain/shared/validation';
import type { UserId } from '@core/domain/value-objects/ids';

import type { EmailAddress } from '../value-objects/EmailAddress';

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
