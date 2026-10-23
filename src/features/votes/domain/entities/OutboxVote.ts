import type { ValidationError } from '@core/domain/errors/ValidationError';
import { VALIDATION_FIELD } from '@core/domain/errors/ValidationError';
import type { RejectionReason } from '@core/domain/errors/VoteDeliveryError';
import { map } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { requireIntegerInRange } from '@core/domain/shared/validation';
import type { Instant } from '@core/domain/value-objects/Instant';

import type { Vote } from './Vote';

const MAX_ATTEMPTS = 1_000_000;

/** Where a vote of the outbox stands. */
export const OUTBOX_STATUS = {
  /** Waiting to be sent. */
  Pending: 'pending',
  /** Refused by the server, or given up. It will not be sent again. */
  Rejected: 'rejected',
} as const;

/** A vote waiting in the outbox to be sent. */
export interface PendingVote {
  readonly status: typeof OUTBOX_STATUS.Pending;
  readonly vote: Vote;
  readonly enqueuedAt: Instant;
  /** How many times sending it failed in a way that says nothing about the vote itself. */
  readonly attempts: number;
}

/**
 * A vote the outbox keeps but will never send: the server refused it for a business reason, or the
 * app gave up on it (`undeliverable`). It stays until the user acknowledges it. The reason is part
 * of the state: a rejected vote without a reason, or a pending one with a reason, cannot exist.
 */
export interface RejectedVote {
  readonly status: typeof OUTBOX_STATUS.Rejected;
  readonly vote: Vote;
  readonly enqueuedAt: Instant;
  readonly attempts: number;
  readonly reason: RejectionReason;
  readonly rejectedAt: Instant;
}

export type OutboxVote = PendingVote | RejectedVote;

/** A vote that has just been queued: no attempt yet. */
export function createPendingVote(vote: Vote, enqueuedAt: Instant): PendingVote {
  return { status: OUTBOX_STATUS.Pending, vote, enqueuedAt, attempts: 0 };
}

export interface PendingVoteSnapshot {
  readonly vote: Vote;
  readonly enqueuedAt: Instant;
  readonly attempts: number;
}

/** Rebuilds a pending vote read back from storage, checking its attempt count. */
export function restorePendingVote(
  snapshot: PendingVoteSnapshot,
): Result<PendingVote, ValidationError> {
  return map(
    requireIntegerInRange(VALIDATION_FIELD.AttemptCount, snapshot.attempts, 0, MAX_ATTEMPTS),
    (attempts) => ({
      status: OUTBOX_STATUS.Pending,
      vote: snapshot.vote,
      enqueuedAt: snapshot.enqueuedAt,
      attempts,
    }),
  );
}

/** The same pending vote, with one more attempt counted. */
export function recordAttempt(pending: PendingVote): PendingVote {
  return { ...pending, attempts: pending.attempts + 1 };
}

/** The pending vote, moved to the rejected state. Only a pending vote can be rejected. */
export function rejectVote(
  pending: PendingVote,
  reason: RejectionReason,
  rejectedAt: Instant,
): RejectedVote {
  return {
    status: OUTBOX_STATUS.Rejected,
    vote: pending.vote,
    enqueuedAt: pending.enqueuedAt,
    attempts: pending.attempts,
    reason,
    rejectedAt,
  };
}

export function isPending(entry: OutboxVote): entry is PendingVote {
  return entry.status === OUTBOX_STATUS.Pending;
}

export function isRejected(entry: OutboxVote): entry is RejectedVote {
  return entry.status === OUTBOX_STATUS.Rejected;
}
