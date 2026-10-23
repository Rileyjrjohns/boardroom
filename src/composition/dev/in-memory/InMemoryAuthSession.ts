import type { Clock } from '@core/application/ports/Clock';
import { invalidCredentials } from '@features/auth/domain/errors/AuthenticationError';
import { unexpected } from '@core/domain/errors/RepositoryError';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Duration } from '@core/domain/value-objects/Duration';
import { plus } from '@core/domain/value-objects/Instant';
import { clonePlain } from '@core/infrastructure/shared/clonePlain';
import type { AuthSession, SignInFailure } from '@features/auth/application/ports/AuthSession';
import { createSession } from '@features/auth/domain/entities/Session';
import type { Session } from '@features/auth/domain/entities/Session';
import type { User } from '@features/auth/domain/entities/User';
import type { Credentials } from '@features/auth/domain/value-objects/Credentials';

import type { SimulatedNetwork } from './SimulatedNetwork';

/** An account the simulated server knows. The password is a demo value, not a secret. */
export interface DemoAccount {
  readonly user: User;
  readonly password: string;
}

export interface InMemoryAuthSessionOptions {
  readonly clock: Clock;
  /** Signing in is a request to the server: it goes through the same network as the others. */
  readonly network: SimulatedNetwork;
  readonly accounts: readonly DemoAccount[];
  /** How long a session lasts. Counted on the device clock from the sign-in. */
  readonly sessionLifetime: Duration;
}

/**
 * Authentication against the accounts of the simulated server, and the session store of the
 * device in one: it checks the credentials like the server would, and remembers who is signed in
 * like the secure storage would. Tokens do not exist here, so none can leak.
 *
 * A session expires `sessionLifetime` after the sign-in, on the clock it is given. `current`
 * returns it as stored, expired or not, as the port requires.
 */
export class InMemoryAuthSession implements AuthSession {
  private session: Session | undefined;

  constructor(private readonly options: InMemoryAuthSessionOptions) {}

  /**
   * Opens a session for a user without asking for credentials. For the mock configuration that
   * starts signed in, and for tests. Fails only when the expiry would leave the range of an instant.
   */
  openSessionFor(user: User): Result<Session, ValidationError> {
    const { clock, sessionLifetime } = this.options;
    const expiresAt = plus(clock.now(), sessionLifetime);
    if (isErr(expiresAt)) return expiresAt;
    const session = createSession({ user, expiresAt: expiresAt.value });
    this.session = session;
    return ok(clonePlain(session));
  }

  async signIn(credentials: Credentials): Promise<Result<Session, SignInFailure>> {
    const reached = await this.options.network.enter();
    if (isErr(reached)) return reached;

    const account = this.options.accounts.find(({ user }) => user.email === credentials.email);
    if (account === undefined || account.password !== credentials.password) {
      return err(invalidCredentials());
    }

    const opened = this.openSessionFor(account.user);
    return opened.ok ? opened : err(unexpected());
  }

  current(): Promise<Result<Session | undefined, StorageReadFailedError>> {
    return Promise.resolve(ok(this.session === undefined ? undefined : clonePlain(this.session)));
  }

  signOut(): Promise<Result<void, StorageWriteFailedError>> {
    this.session = undefined;
    return Promise.resolve(ok(undefined));
  }
}
