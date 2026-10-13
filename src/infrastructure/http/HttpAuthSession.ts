import type { Session } from '@domain/entities/Session';
import { invalidCredentials } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE, unexpected } from '@domain/errors/RepositoryError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Credentials } from '@domain/value-objects/Credentials';
import type { AuthSession, SignInFailure } from '@application/ports/AuthSession';
import type { Clock } from '@application/ports/Clock';
import type { Monitoring } from '@application/ports/Monitoring';

import { signInResponseSchema, toSignedIn, toSignInRequestWire } from './dto/sessionDto';
import { HTTP_FAILURE_CODE } from './HttpClient';
import type { HttpClient, HttpFailure } from './HttpClient';
import { domainViolation, HTTP_RESOURCE } from './invalidResponse';
import { HTTP_METHOD, HTTP_STATUS, ROUTES } from './protocol';
import { statusCause } from './statusCause';
import type { SessionVault } from '../secure-storage/SessionVault';

export interface HttpAuthSessionOptions {
  readonly client: HttpClient;
  /** Where the session and its token are kept, and where the client reads the token from. */
  readonly vault: SessionVault;
  readonly clock: Clock;
  readonly monitoring: Monitoring;
}

/**
 * Authentication against the API (`POST /auth/sign-in`), with the session kept in the secure
 * storage of the device (`SessionVault`).
 *
 * - The server answers with a token and the lifetime it grants. The token stays in the vault: the
 *   application only ever sees the `Session`, whose expiry is computed here, on the clock of the
 *   device, from that lifetime.
 * - A new session replaces the old one with one write; a refused sign-in changes nothing.
 * - `current` reads the session from memory once it has been loaded from the storage.
 * - Signing out forgets the session on the device. The demo API has no endpoint to revoke a token:
 *   it stays valid on the server until it expires (see docs/api.md).
 */
export class HttpAuthSession implements AuthSession {
  constructor(private readonly options: HttpAuthSessionOptions) {}

  async signIn(credentials: Credentials): Promise<Result<Session, SignInFailure>> {
    const { client, vault, clock, monitoring } = this.options;

    const answer = await client.request({
      method: HTTP_METHOD.Post,
      path: ROUTES.signIn,
      body: toSignInRequestWire(credentials),
      authenticated: false,
      resource: HTTP_RESOURCE.Session,
      schema: signInResponseSchema,
    });
    if (!answer.ok) return err(signInFailureOf(answer.error));

    const signedIn = toSignedIn(answer.value, clock.now());
    if (!signedIn.ok) {
      return err(domainViolation(monitoring, HTTP_RESOURCE.Session, signedIn.error));
    }

    const stored = await vault.replace(signedIn.value);
    return stored.ok ? ok(signedIn.value.session) : stored;
  }

  current(): Promise<Result<Session | undefined, StorageReadFailedError>> {
    return this.options.vault.session();
  }

  signOut(): Promise<Result<void, StorageWriteFailedError>> {
    return this.options.vault.clear();
  }
}

/** 401 is the server refusing the credentials: signing in has no session to end. */
function signInFailureOf(failure: HttpFailure): SignInFailure {
  switch (failure.code) {
    case REPOSITORY_ERROR_CODE.Unauthorized:
      return invalidCredentials();
    case REPOSITORY_ERROR_CODE.NetworkUnavailable:
    case REPOSITORY_ERROR_CODE.Unexpected:
      return failure;
    case REPOSITORY_ERROR_CODE.Forbidden:
      return unexpected(statusCause(HTTP_STATUS.Forbidden));
    case REPOSITORY_ERROR_CODE.NotFound:
      return unexpected(statusCause(HTTP_STATUS.NotFound));
    case HTTP_FAILURE_CODE.RequestRejected:
      return unexpected(statusCause(HTTP_STATUS.UnprocessableContent));
  }
}
