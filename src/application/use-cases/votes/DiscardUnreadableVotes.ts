import type { StorageWriteFailedError } from '@domain/errors/StorageError';
import { isErr } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import type { VoteOutbox } from '../../ports/VoteOutbox';
import { requireSession } from '../../shared/requireSession';
import type { RequireSessionDeps, SessionRequiredError } from '../../shared/requireSession';

export interface DiscardUnreadableVotesDeps extends RequireSessionDeps {
  readonly outbox: VoteOutbox;
}

export type DiscardUnreadableVotesError = SessionRequiredError | StorageWriteFailedError;

/**
 * The user asks to be rid of the entries of their outbox that can no longer be read as a vote
 * (see `VoteOutbox`): they are deleted for good, and the answer is how many there were. Nothing
 * else deletes them: a read, a vote queued under their key and a synchronisation all leave them
 * where they are, because an entry nobody can read may still be the only trace of a vote. The
 * screen says how many there are before it asks, and asks for a confirmation.
 *
 * Requires a valid session; only the entries of the signed-in user are discarded. Asking again
 * discards nothing and says zero.
 */
export class DiscardUnreadableVotes {
  constructor(private readonly deps: DiscardUnreadableVotesDeps) {}

  async execute(): Promise<Result<number, DiscardUnreadableVotesError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    const discarded = await this.deps.outbox.discardUnreadable(session.value.user.id);
    if (isErr(discarded)) return discarded;

    this.deps.monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.UnreadableVotesDiscarded, {
      [LOG_ATTRIBUTE.Discarded]: discarded.value,
    });
    return discarded;
  }
}
