import type { StorageWriteFailedError } from '@domain/errors/StorageError';
import type { Result } from '@domain/shared/Result';

import type { AuthSession } from '../../ports/AuthSession';
import type { DocumentCache } from '../../ports/DocumentCache';
import type { MeetingCache } from '../../ports/MeetingCache';
import type { Monitoring } from '../../ports/Monitoring';
import { purgeCaches } from '../../shared/purgeCaches';

export interface SignOutDeps {
  readonly auth: AuthSession;
  readonly meetingCache: MeetingCache;
  readonly documentCache: DocumentCache;
  readonly monitoring: Monitoring;
}

/**
 * Signs the current user out, and empties the meeting and document caches first (the stored
 * content of the documents included), so that the next user of the device finds nothing of what
 * this one saw. Succeeds when nobody was signed in.
 *
 * A cache that cannot be emptied is captured by the monitoring and does not make the sign-out
 * fail: the entries are kept per user (see `MeetingCache`), so the next user cannot read them
 * anyway. The vote outbox is not touched: the votes of this user wait for them to come back.
 */
export class SignOut {
  constructor(private readonly deps: SignOutDeps) {}

  async execute(): Promise<Result<void, StorageWriteFailedError>> {
    await purgeCaches(this.deps);
    return this.deps.auth.signOut();
  }
}
