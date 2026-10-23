import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import type { RejectionReason } from '@features/votes/domain/errors/VoteDeliveryError';
import { ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { ResolutionId, UserId } from '@core/domain/value-objects/ids';
import { clonePlain } from '@core/infrastructure/shared/clonePlain';
import { ENQUEUE_OUTCOME } from '@features/votes/application/ports/VoteOutbox';
import type {
  EnqueueResult,
  OutboxListing,
  VoteOutbox,
} from '@features/votes/application/ports/VoteOutbox';
import { isPending, recordAttempt, rejectVote } from '@features/votes/domain/entities/OutboxVote';
import type { OutboxVote, PendingVote } from '@features/votes/domain/entities/OutboxVote';
import type { IdempotencyKey } from '@features/votes/domain/entities/Vote';

/**
 * A vote outbox in memory: a queue in the order of enqueueing, scoped by voter on every read, with
 * the idempotent writes the port describes and `markAttempt`, which is not. What it is given and
 * what it hands back are copies. It is not durable: it lives as long as the process, which is what
 * the SQLite adapter of the persistence step fixes. It holds its entries as typed values, so it has
 * no entry that cannot be read.
 */
export class InMemoryVoteOutbox implements VoteOutbox {
  private entries: OutboxVote[] = [];

  enqueue(pending: PendingVote): Promise<Result<EnqueueResult, StorageWriteFailedError>> {
    const existing = this.entries.find(
      ({ vote }) => vote.idempotencyKey === pending.vote.idempotencyKey,
    );
    if (existing !== undefined) {
      return Promise.resolve(
        ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: clonePlain(existing) }),
      );
    }
    this.entries.push(clonePlain(pending));
    return Promise.resolve(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
  }

  list(voterId: UserId): Promise<Result<OutboxListing, StorageReadFailedError>> {
    return Promise.resolve(
      ok({
        votes: clonePlain(this.entries.filter(({ vote }) => vote.voterId === voterId)),
        unreadable: 0,
      }),
    );
  }

  /** It holds its entries as typed values, so none of them can be unreadable: nothing to discard. */
  discardUnreadable(): Promise<Result<number, StorageWriteFailedError>> {
    return Promise.resolve(ok(0));
  }

  findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    return Promise.resolve(
      ok(
        clonePlain(
          this.entries.filter(
            ({ vote }) => vote.resolutionId === resolutionId && vote.voterId === voterId,
          ),
        ),
      ),
    );
  }

  markAttempt(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    this.entries = this.entries.map((entry) =>
      entry.vote.idempotencyKey === key && isPending(entry) ? recordAttempt(entry) : entry,
    );
    return Promise.resolve(ok(undefined));
  }

  reject(
    key: IdempotencyKey,
    reason: RejectionReason,
    rejectedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    this.entries = this.entries.map((entry) =>
      entry.vote.idempotencyKey === key && isPending(entry)
        ? rejectVote(entry, clonePlain(reason), rejectedAt)
        : entry,
    );
    return Promise.resolve(ok(undefined));
  }

  remove(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    this.entries = this.entries.filter(({ vote }) => vote.idempotencyKey !== key);
    return Promise.resolve(ok(undefined));
  }
}
