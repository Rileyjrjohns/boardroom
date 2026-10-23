import type { RejectionReason } from '@core/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import type { VotingError } from '@core/domain/errors/VotingError';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { UserId } from '@core/domain/value-objects/ids';
import { findParticipant } from '@features/meetings/domain/entities/Meeting';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { ParticipantRole } from '@features/meetings/domain/entities/Participant';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';
import type { OutboxContent } from '@features/votes/application/use-cases/ListPendingVotes';
import { checkVotingEligibility } from '@features/votes/domain/policies/votingEligibility';

/** Where the vote of the user stands on one resolution, for the screen. */
export const VOTE_VIEW = {
  /** What decides it (who the user is, what waits in the outbox) is still being read. */
  Loading: 'loading',
  /** It could not be read: nothing is said about the vote, and nothing can be cast. */
  Unavailable: 'unavailable',
  /** The user may vote now. */
  Eligible: 'eligible',
  /** The user voted and the vote waits in the outbox to be sent. */
  Queued: 'queued',
  /** The user's vote was refused, or given up, and they have not yet acknowledged it. */
  Rejected: 'rejected',
  /** The user may not vote, and the rule says why. */
  Ineligible: 'ineligible',
} as const;

export type ResolutionVoteView =
  | { readonly kind: typeof VOTE_VIEW.Loading }
  | { readonly kind: typeof VOTE_VIEW.Unavailable }
  | { readonly kind: typeof VOTE_VIEW.Eligible }
  | { readonly kind: typeof VOTE_VIEW.Queued; readonly choice: VoteChoice }
  | { readonly kind: typeof VOTE_VIEW.Rejected; readonly reason: RejectionReason }
  | {
      readonly kind: typeof VOTE_VIEW.Ineligible;
      readonly error: VotingError;
      /** The role of the user in the meeting, told when it is what keeps them from voting. */
      readonly role?: ParticipantRole;
    };

export interface ResolutionVoteInput {
  readonly meeting: Meeting;
  readonly resolution: Resolution;
  readonly voterId: UserId;
  readonly outbox: Pick<OutboxContent, 'pending' | 'rejected'>;
  /** The instant the meeting was loaded at: the screen reads no clock. */
  readonly now: Instant;
}

/**
 * What the screen says about the vote of the user on a resolution. The rule is not written here:
 * whether the user may vote is `checkVotingEligibility`, the one the use case `CastVote` applies,
 * run on the meeting that was loaded and on the votes of the outbox; this only orders what the
 * screen has to tell, most urgent first:
 *
 * 1. a vote of the user that was refused and not yet acknowledged: it blocks a new vote, and the
 *    user has to see why;
 * 2. a vote that waits to be sent, with the choice, whether or not the rule would let them vote
 *    now (it will be judged again by the server when it is sent);
 * 3. the reason the rule gives for not voting;
 * 4. otherwise, the right to vote.
 */
export function resolutionVoteView(input: ResolutionVoteInput): ResolutionVoteView {
  const { meeting, resolution, voterId, outbox, now } = input;
  const ofThisResolution = ({ vote }: { readonly vote: { readonly resolutionId: string } }) =>
    vote.resolutionId === resolution.id;

  const rejected = outbox.rejected.find(ofThisResolution);
  if (rejected !== undefined) return { kind: VOTE_VIEW.Rejected, reason: rejected.reason };

  const queued = outbox.pending.find(ofThisResolution);
  if (queued !== undefined) return { kind: VOTE_VIEW.Queued, choice: queued.vote.choice };

  const eligibility = checkVotingEligibility({
    meeting,
    resolutionId: resolution.id,
    voterId,
    // Nothing of this resolution waits in the outbox: a queued vote was answered above.
    queuedVotes: [],
    now,
  });
  if (eligibility.ok) return { kind: VOTE_VIEW.Eligible };

  const { error } = eligibility;
  const role =
    error.code === VOTING_ERROR_CODE.NoVotingRights
      ? findParticipant(meeting, voterId)?.role
      : undefined;
  return role === undefined
    ? { kind: VOTE_VIEW.Ineligible, error }
    : { kind: VOTE_VIEW.Ineligible, error, role };
}
