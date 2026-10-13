import { ok, err } from '../shared/Result';
import type { Result } from '../shared/Result';
import { findParticipant, findResolution } from '../entities/Meeting';
import type { Meeting } from '../entities/Meeting';
import { hasVotingRights } from '../entities/Participant';
import type { PendingVote } from '../entities/OutboxVote';
import { RESOLUTION_STATUS } from '../entities/Resolution';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '../errors/VotingError';
import type { VotingError } from '../errors/VotingError';
import type { ResolutionId, UserId } from '../value-objects/ids';
import { isAtOrAfter } from '../value-objects/Instant';
import type { Instant } from '../value-objects/Instant';

export interface VotingEligibilityInput {
  readonly meeting: Meeting;
  readonly resolutionId: ResolutionId;
  readonly voterId: UserId;
  /** The votes waiting in the outbox for this resolution, whoever cast them. */
  readonly queuedVotes: readonly PendingVote[];
  readonly now: Instant;
}

/**
 * May this voter vote on this resolution now? Ok, or the first reason why not, checked in this
 * order:
 *
 * 1. the meeting has no such resolution;
 * 2. the voter is not a participant of the meeting;
 * 3. the voter's role carries no vote;
 * 4. the resolution is closed;
 * 5. its voting window is over (`closesAt` is reached: the instant itself is already too late);
 * 6. the voter has already voted, either a vote the remote source records or one waiting in the
 *    outbox. A cast vote is final: there is no second vote and no change of mind.
 */
export function checkVotingEligibility(input: VotingEligibilityInput): Result<void, VotingError> {
  const { meeting, resolutionId, voterId, queuedVotes, now } = input;

  const resolution = findResolution(meeting, resolutionId);
  if (resolution === undefined)
    return err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId });

  const participant = findParticipant(meeting, voterId);
  if (participant === undefined) return err({ code: VOTING_ERROR_CODE.NotAParticipant });
  if (!hasVotingRights(participant)) return err({ code: VOTING_ERROR_CODE.NoVotingRights });

  if (resolution.status === RESOLUTION_STATUS.Closed) {
    return err({ code: VOTING_ERROR_CODE.ResolutionClosed });
  }
  if (resolution.closesAt !== undefined && isAtOrAfter(now, resolution.closesAt)) {
    return err({ code: VOTING_ERROR_CODE.VotingWindowOver });
  }

  if (resolution.recordedVote !== undefined) {
    return err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded });
  }
  const alreadyQueued = queuedVotes.some(
    ({ vote }) => vote.resolutionId === resolutionId && vote.voterId === voterId,
  );
  if (alreadyQueued) {
    return err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued });
  }

  return ok(undefined);
}
