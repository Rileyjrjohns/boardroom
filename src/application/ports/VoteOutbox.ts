import type { OutboxVote, PendingVote } from '@domain/entities/OutboxVote';
import type { IdempotencyKey } from '@domain/entities/Vote';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { RejectionReason } from '@domain/errors/VoteDeliveryError';
import type { Result } from '@domain/shared/Result';
import type { ResolutionId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';

/** What `enqueue` did. */
export const ENQUEUE_OUTCOME = {
  Enqueued: 'enqueued',
  /** A vote with the same idempotency key was already in the outbox: nothing changed. */
  AlreadyQueued: 'alreadyQueued',
} as const;

export type EnqueueResult =
  | { readonly outcome: typeof ENQUEUE_OUTCOME.Enqueued }
  | {
      readonly outcome: typeof ENQUEUE_OUTCOME.AlreadyQueued;
      /** The vote that holds the key, pending or rejected. */
      readonly existing: OutboxVote;
    };

/**
 * The durable local queue of votes cast without a network, waiting to be sent, and of the votes
 * that ended rejected until the user acknowledges them. It must survive the app being closed. It is
 * NOT cleared when a user signs out: a vote is scoped by its voter and must be sent when they come
 * back.
 *
 * It holds the choices of secret ballots, and it outlives the sign-out, so it needs protection at
 * rest: an adapter stores it encrypted (the keystore / the secure storage of the device), in
 * app-private storage excluded from backups. Its content is never logged. A vote is found by its
 * whole idempotency key: two keys that share a prefix, or differ only in case, are two votes, and
 * a lookup by prefix or substring would merge them.
 *
 * It is read and written by `CastVote` (a vote that could not be delivered), `SyncPendingVotes`
 * (the presentation or the composition root triggers it when connectivity is regained and when the
 * app returns to the foreground; the application layer does not watch the network),
 * `ListPendingVotes` and `AcknowledgeRejectedVote`.
 *
 * Reads are scoped by voter: `list` and `findByResolution` take the voter and never return the
 * vote of anybody else. A key already holds the voter (see `idempotencyKeyOf`), which scopes
 * the writes.
 *
 * Contract:
 * - No method throws or rejects. Only a store that cannot be read or written returns a storage
 *   error. Every method settles in bounded time; a store that does not answer in time is a
 *   storage error.
 * - Idempotent writes: `enqueue` (a second call with the same key changes nothing and says so),
 *   `reject` (rejecting a vote that is already rejected, or unknown, changes nothing) and `remove`
 *   (removing an unknown key succeeds).
 * - NOT idempotent: `markAttempt` counts one more attempt every time it is called.
 */
export interface VoteOutbox {
  /**
   * Appends a pending vote, unless one with the same idempotency key is already in the outbox,
   * whatever its state. A voter has one vote per resolution, so a second one is never queued: the
   * answer says which case it was, and returns the vote that holds the key.
   */
  enqueue(pending: PendingVote): Promise<Result<EnqueueResult, StorageWriteFailedError>>;

  /** The votes of a voter, pending and rejected, oldest first (the order of enqueueing). */
  list(voterId: UserId): Promise<Result<readonly OutboxVote[], StorageReadFailedError>>;

  /** The votes of a voter on a resolution, pending and rejected. Empty when there is none. */
  findByResolution(
    resolutionId: ResolutionId,
    voterId: UserId,
  ): Promise<Result<readonly OutboxVote[], StorageReadFailedError>>;

  /** Counts one more attempt on a pending vote. Does nothing when the key is unknown or rejected. */
  markAttempt(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>>;

  /**
   * Moves a pending vote to the rejected state, with its reason and the instant (`rejectVote`).
   * Does nothing when the key is unknown or the vote is already rejected.
   */
  reject(
    key: IdempotencyKey,
    reason: RejectionReason,
    rejectedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>>;

  /** Removes a vote, pending or rejected. Does nothing when the key is unknown. */
  remove(key: IdempotencyKey): Promise<Result<void, StorageWriteFailedError>>;
}
