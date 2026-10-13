import { isPending } from '@domain/entities/OutboxVote';
import type { StorageError } from '@domain/errors/StorageError';
import { voteNotRejected } from '@domain/errors/VoteDeliveryError';
import type { VoteNotRejectedError } from '@domain/errors/VoteDeliveryError';
import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { ResolutionId } from '@domain/value-objects/ids';

import type { AuthSession } from '../../ports/AuthSession';
import type { Clock } from '../../ports/Clock';
import type { VoteOutbox } from '../../ports/VoteOutbox';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export interface AcknowledgeRejectedVoteDeps {
  readonly auth: AuthSession;
  readonly clock: Clock;
  readonly outbox: VoteOutbox;
}

export interface AcknowledgeRejectedVoteInput {
  readonly resolutionId: ResolutionId;
}

export type AcknowledgeRejectedVoteError =
  SessionRequiredError | StorageError | VoteNotRejectedError;

/**
 * The user has seen that their vote on a resolution was rejected: deletes it from the outbox.
 * Requires a valid session; only the vote of the signed-in user can be acknowledged. A vote that
 * is still pending is not touched (`voteNotRejected`): it is deleted by being sent, never by
 * acknowledging. A resolution with no vote in the outbox is not an error (nothing to do), so a
 * double tap is harmless.
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

    const entry = found.value[0];
    if (entry === undefined) return ok(undefined);
    if (isPending(entry)) return err(voteNotRejected());

    return outbox.remove(entry.vote.idempotencyKey);
  }
}
