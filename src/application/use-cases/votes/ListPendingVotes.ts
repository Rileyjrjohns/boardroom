import { isPending, isRejected } from '@domain/entities/OutboxVote';
import type { PendingVote, RejectedVote } from '@domain/entities/OutboxVote';
import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { VoteOutbox } from '../../ports/VoteOutbox';
import { requireSession } from '../../shared/requireSession';
import type { RequireSessionDeps, SessionRequiredError } from '../../shared/requireSession';

export interface ListPendingVotesDeps extends RequireSessionDeps {
  readonly outbox: VoteOutbox;
}

/** The votes of the signed-in user in the outbox, told apart by their state. Oldest first. */
export interface OutboxContent {
  /** Waiting to be sent. */
  readonly pending: readonly PendingVote[];
  /** Refused or given up, with the reason. They stay until the user acknowledges them. */
  readonly rejected: readonly RejectedVote[];
}

export type ListPendingVotesError = SessionRequiredError | StorageReadFailedError;

/**
 * The votes of the signed-in user that wait in the outbox, and the ones that ended rejected. The
 * outbox is shared by everybody who signs in on the device: the votes of another user are never
 * read (the port is scoped by voter).
 */
export class ListPendingVotes {
  constructor(private readonly deps: ListPendingVotesDeps) {}

  async execute(): Promise<Result<OutboxContent, ListPendingVotesError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    const listed = await this.deps.outbox.list(session.value.user.id);
    if (isErr(listed)) return listed;

    return ok({
      pending: listed.value.filter(isPending),
      rejected: listed.value.filter(isRejected),
    });
  }
}
