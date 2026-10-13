import type { VotingError } from './VotingError';

/** What can go wrong between a vote being cast and the server recording it. */
export const VOTE_DELIVERY_ERROR_CODE = {
  Undeliverable: 'voteUndeliverable',
  PreviouslyRejected: 'votePreviouslyRejected',
  InProgress: 'voteInProgress',
  NotRejected: 'voteNotRejected',
} as const;

/**
 * The vote could not be delivered: sending it failed unexpectedly `attempts` times, and the app
 * gave up. It is a reason a queued vote is moved to the rejected state, so that the user sees it.
 */
export interface VoteUndeliverableError {
  readonly code: typeof VOTE_DELIVERY_ERROR_CODE.Undeliverable;
  readonly attempts: number;
}

/** Why a queued vote ended in the rejected state: the server refused it, or it was given up. */
export type RejectionReason = VotingError | VoteUndeliverableError;

/**
 * A new vote on a resolution was refused because an earlier vote of the same voter on it is still
 * in the outbox, rejected. The user acknowledges the rejected vote before anything else.
 */
export interface VotePreviouslyRejectedError {
  readonly code: typeof VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected;
  readonly reason: RejectionReason;
}

/** A vote on the same resolution is being cast right now (on this instance of the use case). */
export interface VoteInProgressError {
  readonly code: typeof VOTE_DELIVERY_ERROR_CODE.InProgress;
}

/** Only a rejected vote can be acknowledged; this one is still waiting to be sent. */
export interface VoteNotRejectedError {
  readonly code: typeof VOTE_DELIVERY_ERROR_CODE.NotRejected;
}

export function voteUndeliverable(attempts: number): VoteUndeliverableError {
  return { code: VOTE_DELIVERY_ERROR_CODE.Undeliverable, attempts };
}

export function votePreviouslyRejected(reason: RejectionReason): VotePreviouslyRejectedError {
  return { code: VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected, reason };
}

export function voteInProgress(): VoteInProgressError {
  return { code: VOTE_DELIVERY_ERROR_CODE.InProgress };
}

export function voteNotRejected(): VoteNotRejectedError {
  return { code: VOTE_DELIVERY_ERROR_CODE.NotRejected };
}
