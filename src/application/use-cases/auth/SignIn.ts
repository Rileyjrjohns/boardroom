import type { Session } from '@domain/entities/Session';
import type { ValidationError } from '@domain/errors/ValidationError';
import { andThenAsync } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { createCredentials } from '@domain/value-objects/Credentials';

import type { AuthSession, SignInFailure } from '../../ports/AuthSession';

export interface SignInDeps {
  readonly auth: AuthSession;
}

/** What the user typed. Validated here, not by the screen. */
export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export type SignInError = ValidationError | SignInFailure;

/** Signs a user in with an email and a password. */
export class SignIn {
  constructor(private readonly deps: SignInDeps) {}

  /** A badly formed email or an empty password is a `validation` error: the server is not called. */
  execute(input: SignInInput): Promise<Result<Session, SignInError>> {
    return andThenAsync(createCredentials(input.email, input.password), (credentials) =>
      this.deps.auth.signIn(credentials),
    );
  }
}
