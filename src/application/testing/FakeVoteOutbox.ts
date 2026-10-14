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
import type { EnqueueResult, OutboxListing, VoteOutbox } from '../ports/VoteOutbox';

import { copyPlain } from './copyPlain';

/** An entry the fake keeps but cannot read: what the voter owns and the key it sits under. */
interface UnreadableEntry {
  readonly voterId: UserId;
  readonly key: string;
}

/**
 * An in-memory queue that honours the contract of the port: FIFO, reads scoped by voter, the
 * idempotent writes, and `markAttempt` that is not. It keeps copies of what it is given and hands
 * back copies of what it holds. A test can plant entries it cannot read (`seedUnreadable`), which
 * it quarantines the way the port says.
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
  /** Makes `discardUnreadable` fail while set (nothing is discarded). */
  discardFailure: StorageWriteFailedError | undefined;

  /**
   * Called when `list`, `findByResolution` or `discardUnreadable` is asked, before the outbox
   * answers: a test uses it to change the world while the read is in flight (another user signs
   * in, say). The answer is still the one for the voter that was asked about.
   */
  onRequest: (() => void | Promise<void>) | undefined;

  private entries: OutboxVote[] = [];
  private unreadable: UnreadableEntry[] = [];

  /** Puts votes in the queue without going through the port. */
  seed(...entries: OutboxVote[]): void {
    this.entries.push(...copyPlain(entries));
  }

  /** Plants an entry of the voter that cannot be read, under a key. */
  seedUnreadable(voterId: UserId, key = 'unreadable'): void {
    this.unreadable.push({ voterId, key });
  }

  /** The entries nobody can read that are kept, of every voter. */
  unreadableSnapshot(): readonly UnreadableEntry[] {
    return copyPlain(this.unreadable);
  }

  /** The whole queue, of every voter, oldest first. */
  snapshot(): OutboxVote[] {
    return copyPlain(this.entries);
  }

  enqueue(pending: PendingVote): Promise<Result<EnqueueResult, StorageWriteFailedError>> {
    if (this.enqueueFailure !== undefined) return Promise.resolve(err(this.enqueueFailure));
    if (this.unreadable.some(({ key }) => key === pending.vote.idempotencyKey)) {
      return Promise.resolve(ok({ outcome: ENQUEUE_OUTCOME.HeldByUnreadable }));
    }
    const existing = this.entries.find(
      ({ vote }) => vote.idempotencyKey === pending.vote.idempotencyKey,
    );
    if (existing !== undefined) {
      return Promise.resolve(
        ok({ outcome: ENQUEUE_OUTCOME.AlreadyQueued, existing: copyPlain(existing) }),
      );
    }
    this.entries.push(copyPlain(pending));
    return Promise.resolve(ok({ outcome: ENQUEUE_OUTCOME.Enqueued }));
  }

  async list(voterId: UserId): Promise<Result<OutboxListing, StorageReadFailedError>> {
    await this.onRequest?.();
    if (this.listFailure !== undefined) return err(this.listFailure);
    return ok({
      votes: copyPlain(this.entries.filter(({ vote }) => vote.voterId === voterId)),
      unreadable: this.unreadable.filter((entry) => entry.voterId === voterId).length,
    });
  }

  async discardUnreadable(voterId: UserId): Promise<Result<number, StorageWriteFailedError>> {
    await this.onRequest?.();
    if (this.discardFailure !== undefined) return err(this.discardFailure);
    const before = this.unreadable.length;
    this.unreadable = this.unreadable.filter((entry) => entry.voterId !== voterId);
    return ok(before - this.unreadable.length);
  }

  async findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>> {
    await this.onRequest?.();
    if (this.findFailure !== undefined) return err(this.findFailure);
    return ok(
      copyPlain(
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
        ? rejectVote(entry, copyPlain(reason), rejectedAt)
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
