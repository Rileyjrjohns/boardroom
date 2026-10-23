import type { Monitoring } from '@core/application/ports/Monitoring';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';

import type { AuthSession } from '../ports/AuthSession';
import type { SessionDataPurger } from '../ports/SessionDataPurger';
import type { AppLock } from '../session/AppLock';
import { closeSession } from '../session/endSession';

export interface SignOutDeps {
  readonly auth: AuthSession;
  /** Emptied first: see `purgeCaches`. */
  readonly sessionDataPurgers: readonly SessionDataPurger[];
  readonly monitoring: Monitoring;
  /** The instance shared by every use case: see `AppLock`. */
  readonly appLock: AppLock;
}

/**
 * Signs the current user out, and empties what the session left on the device first (the meeting and
 * document caches, the stored content of the documents included), so that the next user of the device finds nothing of what
 * this one saw. Succeeds when nobody was signed in. The app is locked first, and stays locked: the
 * next sign-in opens it again.
 *
 * A cache that cannot be emptied is captured by the monitoring and does not make the sign-out
 * fail: the entries are kept per user (see `MeetingCache`), so the next user cannot read them
 * anyway, and the next sign-in empties the caches again (see `SignIn`). The vote outbox is not
 * touched: the votes of this user wait for them to come back.
 */
export class SignOut {
  constructor(private readonly deps: SignOutDeps) {}

  async execute(): Promise<Result<void, StorageWriteFailedError>> {
    return closeSession(this.deps);
  }
}
