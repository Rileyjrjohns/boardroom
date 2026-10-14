import { isPending, isRejected } from '@domain/entities/OutboxVote';
import type { PendingVote, RejectedVote } from '@domain/entities/OutboxVote';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { VoteOutbox } from '../../ports/VoteOutbox';
import { requireSameUser, requireSession } from '../../shared/requireSession';
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
  /**
   * How many entries of the user are kept but cannot be read as a vote any more. They are neither
   * sent nor shown, and stay until the user discards them (`DiscardUnreadableVotes`).
   */
  readonly unreadable: number;
}

export type ListPendingVotesError =
  SessionRequiredError | SessionChangedError | StorageReadFailedError;

/**
 * The votes of the signed-in user that wait in the outbox, and the ones that ended rejected. The
 * outbox is shared by everybody who signs in on the device: the votes of another user are never
 * read (the port is scoped by voter). It also says how many entries of the user cannot be read:
 * the user is told, and decides whether to discard them.
 *
 * The read takes time, and the user can sign out (or somebody else sign in) while it is in flight:
 * the session is checked again once it answers (`requireSameUser`), and the entries are returned
 * to nobody else than the user they belong to (`sessionChanged`, or `appLocked` if the app was
 * locked meanwhile).
 */
export class ListPendingVotes {
  constructor(private readonly deps: ListPendingVotesDeps) {}

  async execute(): Promise<Result<OutboxContent, ListPendingVotesError>> {
    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    const listed = await this.deps.outbox.list(session.value.user.id);
    if (isErr(listed)) return listed;

    const stillTheUser = await requireSameUser(this.deps, session.value.user.id);
    if (isErr(stillTheUser)) return stillTheUser;

    const { votes, unreadable } = listed.value;
    return ok({
      pending: votes.filter(isPending),
      rejected: votes.filter(isRejected),
      unreadable,
    });
  }
}
