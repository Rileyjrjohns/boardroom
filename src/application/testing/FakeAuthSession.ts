import type { Session } from '@domain/entities/Session';
import { invalidCredentials } from '@domain/errors/AuthenticationError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { aSession, anEmail } from '@domain/testing/builders';
import type { Credentials } from '@domain/value-objects/Credentials';
import type { EmailAddress } from '@domain/value-objects/EmailAddress';

import type { AuthSession, SignInFailure } from '../ports/AuthSession';

/** The password of the account every fake knows. */
export const DEFAULT_PASSWORD = 'secret';

/**
 * Remembers one session, like the secure storage of the real adapter, and signs in only the
 * accounts the test registered: the credentials it is given are compared with them, so a use case
 * that changes the email or the password on its way is caught. One account exists from the start
 * (`alice@example.com` and `DEFAULT_PASSWORD`, who is the default session). Scriptable: a failure
 * of the sign-in, and failures of the storage.
 */
export class FakeAuthSession implements AuthSession {
  /** The stored session; the default user is signed in. `undefined`: nobody is signed in. */
  session: Session | undefined = aSession();
  /** Makes `signIn` fail with this error while set (no network, say), whatever the credentials. */
  signInFailure: SignInFailure | undefined;
  /** Makes `current` fail while set. */
  readFailure: StorageReadFailedError | undefined;
  /** Makes `signOut` fail while set (the session is kept). */
  signOutFailure: StorageWriteFailedError | undefined;

  readonly signInCalls: Credentials[] = [];
  signOutCalls = 0;

  private readonly accounts = new Map<EmailAddress, { password: string; session: Session }>([
    [anEmail(), { password: DEFAULT_PASSWORD, session: aSession() }],
  ]);

  /** An account that `signIn` accepts, and the session it opens. */
  registerAccount(email: EmailAddress, password: string, session: Session): void {
    this.accounts.set(email, { password, session });
  }

  signIn(credentials: Credentials): Promise<Result<Session, SignInFailure>> {
    this.signInCalls.push(credentials);
    if (this.signInFailure !== undefined) return Promise.resolve(err(this.signInFailure));

    const account = this.accounts.get(credentials.email);
    if (account === undefined || account.password !== credentials.password) {
      return Promise.resolve(err(invalidCredentials()));
    }
    this.session = account.session;
    return Promise.resolve(ok(account.session));
  }

  current(): Promise<Result<Session | undefined, StorageReadFailedError>> {
    return Promise.resolve(
      this.readFailure === undefined ? ok(this.session) : err(this.readFailure),
    );
  }

  signOut(): Promise<Result<void, StorageWriteFailedError>> {
    this.signOutCalls += 1;
    if (this.signOutFailure !== undefined) {
      return Promise.resolve(err(this.signOutFailure));
    }
    this.session = undefined;
    return Promise.resolve(ok(undefined));
  }
}
