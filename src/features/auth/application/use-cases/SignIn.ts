import type { Monitoring } from '@core/application/ports/Monitoring';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import { andThenAsync, isErr } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Session } from '@features/auth/domain/entities/Session';
import { createCredentials } from '@features/auth/domain/value-objects/Credentials';
import type { DocumentCache } from '@features/documents/application/ports/DocumentCache';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';

import type { AuthSession, SignInFailure } from '../ports/AuthSession';
import type { AppLock } from '../session/AppLock';
import { purgeCaches } from '../session/purgeCaches';

export interface SignInDeps {
  readonly auth: AuthSession;
  readonly meetingCache: MeetingCache;
  readonly documentCache: DocumentCache;
  readonly monitoring: Monitoring;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

/** What the user typed. Validated here, not by the screen. */
export interface SignInInput {
  readonly email: string;
  readonly password: string;
}

export type SignInError = ValidationError | SignInFailure;

/**
 * Signs a user in with an email and a password. A badly formed email or an empty password is a
 * `validation` error: the server is not called.
 *
 * Once the credentials are accepted, and before the new session is used by anything, both caches
 * are emptied: whoever signed in before (a sign-out that never came, a session that expired while
 * the app was closed, a purge that failed) does not leave their content on the device for the new
 * user. This is also the retry of a purge that failed earlier. A purge that fails is captured and
 * does not stop the sign-in: the caches are kept per owner, so the new user cannot read what is
 * left, and the next sign-in tries again. The app is locked while it is emptied and left unlocked
 * after it: the user has just typed their credentials, which is the proof of presence.
 *
 * A refused sign-in changes nothing: the current session, the caches and the lock stay as they were.
 */
export class SignIn {
  constructor(private readonly deps: SignInDeps) {}

  async execute(input: SignInInput): Promise<Result<Session, SignInError>> {
    const { auth, appLock } = this.deps;

    const signedIn = await andThenAsync(
      createCredentials(input.email, input.password),
      (credentials) => auth.signIn(credentials),
    );
    if (isErr(signedIn)) return signedIn;

    appLock.lock();
    await purgeCaches(this.deps);
    appLock.unlock();
    return signedIn;
  }
}
