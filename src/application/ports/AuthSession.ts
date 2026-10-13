import type { Session } from '@domain/entities/Session';
import type { InvalidCredentialsError } from '@domain/errors/AuthenticationError';
import type { NetworkUnavailableError, UnexpectedError } from '@domain/errors/RepositoryError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { Credentials } from '@domain/value-objects/Credentials';
import type { Result } from '@domain/shared/Result';

/** What can go wrong when signing in. */
export type SignInFailure =
  InvalidCredentialsError | NetworkUnavailableError | UnexpectedError | StorageWriteFailedError;

/**
 * Signs the user in, remembers who is signed in, and signs them out. The tokens that prove it stay
 * inside the adapter (in the secure storage of the device): the application only sees a `Session`.
 *
 * Contract: no method throws or rejects, and every method settles in bounded time (a sign-in
 * request that times out is `networkUnavailable`). The `cause` fields of the errors must never hold
 * personal data, a credential, a token, a path or a URL.
 *
 * `signIn` replaces any session that exists atomically: there is no instant at which the adapter
 * holds the tokens of two users, or none while a sign-in succeeds. A refused sign-in leaves the
 * current session as it was. Every request the adapters of the remote ports make carries the
 * identity that was read when the request was created, never that of a user who signs in later.
 *
 * `expiresAt` of a session is on the device clock (see `Session`): the adapter computes it at
 * sign-in from the `Clock` port and the lifetime the server grants.
 */
export interface AuthSession {
  /** Checks the credentials and, when they are accepted, stores and returns the new session. */
  signIn(credentials: Credentials): Promise<Result<Session, SignInFailure>>;

  /**
   * The stored session, or `undefined` when nobody is signed in. It is returned as stored, even
   * when its expiry has passed: deciding that is the application's job, with the clock.
   */
  current(): Promise<Result<Session | undefined, StorageReadFailedError>>;

  /** Forgets the session and its tokens. Signing out when nobody is signed in succeeds. */
  signOut(): Promise<Result<void, StorageWriteFailedError>>;
}
