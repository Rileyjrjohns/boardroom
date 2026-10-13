import { isPending, recordAttempt, rejectVote } from '@domain/entities/OutboxVote';
import type { OutboxVote, PendingVote } from '@domain/entities/OutboxVote';
import type { IdempotencyKey } from '@domain/entities/Vote';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { RejectionReason } from '@domain/errors/VoteDeliveryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { ResolutionId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';

import { ENQUEUE_OUTCOME } from '../ports/VoteOutbox';
import type { EnqueueResult, VoteOutbox } from '../ports/VoteOutbox';

/**
 * An in-memory queue that honours the contract of the port: FIFO, reads scoped by voter, the
 * idempotent writes, and `markAttempt` that is not.
 */
export class FakeVoteOutbox implements VoteOutbox {
  /** Makes `list` fail while set. */
  listFailure: StorageReadFailedError | undefined;
  /** Makes `findByResolution` fail while set. */
  findFailure: StorageReadFailedError | undefined;
  /** Makes `enqueue` fail while set (nothing is queued). */
  enqueueFailure: StorageWriteFailedError | undefined;
  /** Makes `markAttempt` fail while set. */
  markAttemptFailure: StorageWriteFailedError | undefined;
  /** Makes `reject` fail while set (the vote stays pending). */
  rejectFailure: StorageWriteFailedError | undefined;
  /** Makes `remove` fail while set (the vote stays). */
  removeFailure: StorageWriteFailedError | undefined;

  private entries: OutboxVote[] = [];

  /** Puts votes in the queue without going through the port. */
  seed(...entries: OutboxVote[]): void {
    this.entries.push(...entries);
  }

  /** The whole queue, of every voter, oldest first. */
  snapshot(): OutboxVote[] {
    return [...this.entries];
  }

  enqueue(pending: PendingVote): Promise<Result<EnqueueResult, StorageWriteFailedError>> {
    if (this.enqueueFailure !== undefined) return Promise.resolve(err(this.enqueueFailure));
    const existing = this.entries.find(
      ({ vote }) => vote.idempotencyKey === pending.vote.idempotencyKey,
    );
    if (existing !== undefined) {
      return Promise.resolve(ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing }));
    }
    this.entries.push(pending);
    return Promise.resolve(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
  }

  list(voterId: UserId): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    if (this.listFailure !== undefined) return Promise.resolve(err(this.listFailure));
    return Promise.resolve(ok(this.entries.filter(({ vote }) => vote.voterId === voterId)));
  }

  findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    if (this.findFailure !== undefined) return Promise.resolve(err(this.findFailure));
    return Promise.resolve(
      ok(
        this.entries.filter(
          ({ vote }) => vote.resolutionId === resolutionId && vote.voterId === voterId,
        ),
      ),
    );
  }

  markAttempt(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    if (this.markAttemptFailure !== undefined) {
      return Promise.resolve(err(this.markAttemptFailure));
    }
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
    if (this.rejectFailure !== undefined) return Promise.resolve(err(this.rejectFailure));
    this.entries = this.entries.map((entry) =>
      entry.vote.idempotencyKey === key && isPending(entry)
        ? rejectVote(entry, reason, rejectedAt)
        : entry,
    );
    return Promise.resolve(ok(undefined));
  }

  remove(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>> {
    if (this.removeFailure !== undefined) return Promise.resolve(err(this.removeFailure));
    this.entries = this.entries.filter(({ vote }) => vote.idempotencyKey !== key);
    return Promise.resolve(ok(undefined));
  }
}
