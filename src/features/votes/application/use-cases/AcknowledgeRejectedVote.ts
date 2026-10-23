import type { SessionChangedError } from '@core/domain/errors/AuthenticationError';
import type { StorageError } from '@core/domain/errors/StorageError';
import { voteNotRejected } from '@core/domain/errors/VoteDeliveryError';
import type { VoteNotRejectedError } from '@core/domain/errors/VoteDeliveryError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { ResolutionId } from '@core/domain/value-objects/ids';
import { requireSameUser, requireSession } from '@features/auth/application/session/requireSession';
import type {
  RequireSessionDeps,
  SessionRequiredError,
} from '@features/auth/application/session/requireSession';
import { isPending } from '@features/votes/domain/entities/OutboxVote';

import type { VoteOutbox } from '../ports/VoteOutbox';

export interface AcknowledgeRejectedVoteDeps extends RequireSessionDeps {
  readonly outbox: VoteOutbox;
}

export interface AcknowledgeRejectedVoteInput {
  readonly resolutionId: ResolutionId;
}

export type AcknowledgeRejectedVoteError =
  SessionRequiredError | SessionChangedError | StorageError | VoteNotRejectedError;

/**
 * The user has seen that their vote on a resolution was rejected: deletes it from the outbox.
 * Requires a valid session; only the vote of the signed-in user can be acknowledged. A vote that
 * is still pending is not touched (`voteNotRejected`): it is deleted by being sent, never by
 * acknowledging. A resolution with no vote in the outbox is not an error (nothing to do), so a
 * double tap is harmless.
 *
 * The user is checked again once the outbox has answered (`requireSameUser`): if somebody else is
 * signed in by then, or the app is locked, nothing is deleted and the answer is `sessionChanged`
 * (or `appLocked`).
 */
export class AcknowledgeRejectedVote {
  constructor(private readonly deps: AcknowledgeRejectedVoteDeps) {}

  async execute(
    input: AcknowledgeRejectedVoteInput,
  ): Promise<Result<void, AcknowledgeRejectedVoteError>> {
    const { outbox } = this.deps;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;

    const found = await outbox.findByResolution(input.resolutionId, session.value.user.id);
    if (isErr(found)) return found;

    const stillTheUser = await requireSameUser(this.deps, session.value.user.id);
    if (isErr(stillTheUser)) return stillTheUser;

    const entry = found.value[0];
    if (entry === undefined) return ok(undefined);
    if (isPending(entry)) return err(voteNotRejected());

    return outbox.remove(entry.vote.idempotencyKey);
  }
}
