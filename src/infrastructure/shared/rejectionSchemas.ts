import { z } from 'zod';

import { VOTE_DELIVERY_ERROR_CODE } from '@domain/errors/VoteDeliveryError';
import type { RejectionReason } from '@domain/errors/VoteDeliveryError';
import type { ValidationError } from '@domain/errors/ValidationError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { VotingError } from '@domain/errors/VotingError';
import { map, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseResolutionId } from '@domain/value-objects/ids';

// How a business rejection of a vote is written, on the wire (the body of a 422) and in the outbox
// (the reason a vote was rejected). One description for both, so that what the server says and
// what the device remembers cannot drift apart.

const resolutionNotFound = z.object({
  code: z.literal(VOTING_ERROR_CODE.ResolutionNotFound),
  resolutionId: z.string(),
});
const notAParticipant = z.object({ code: z.literal(VOTING_ERROR_CODE.NotAParticipant) });
const noVotingRights = z.object({ code: z.literal(VOTING_ERROR_CODE.NoVotingRights) });
const resolutionClosed = z.object({ code: z.literal(VOTING_ERROR_CODE.ResolutionClosed) });
const votingWindowOver = z.object({ code: z.literal(VOTING_ERROR_CODE.VotingWindowOver) });
const alreadyVoted = z.object({
  code: z.literal(VOTING_ERROR_CODE.AlreadyVoted),
  source: z.enum([ALREADY_VOTED_SOURCE.Recorded, ALREADY_VOTED_SOURCE.Queued]),
});
const voteUndeliverable = z.object({
  code: z.literal(VOTE_DELIVERY_ERROR_CODE.Undeliverable),
  attempts: z.number().int().min(0),
});

const votingErrorMembers = [
  resolutionNotFound,
  notAParticipant,
  noVotingRights,
  resolutionClosed,
  votingWindowOver,
  alreadyVoted,
] as const;

/** A `VotingError` as it is written: a `code` and the fields of that code. */
export const votingErrorSchema = z.discriminatedUnion('code', votingErrorMembers);

/** A `RejectionReason`: a voting error, or the vote being given up after its attempts. */
export const rejectionReasonSchema = z.discriminatedUnion('code', [
  ...votingErrorMembers,
  voteUndeliverable,
]);

export type VotingErrorWire = z.input<typeof votingErrorSchema>;
export type RejectionReasonWire = z.input<typeof rejectionReasonSchema>;

/** The voting error a payload describes, through the factories of the domain. */
export function toVotingError(
  wire: z.output<typeof votingErrorSchema>,
): Result<VotingError, ValidationError> {
  if (wire.code === VOTING_ERROR_CODE.ResolutionNotFound) {
    return map(parseResolutionId(wire.resolutionId), (resolutionId) => ({
      code: wire.code,
      resolutionId,
    }));
  }
  return ok(wire);
}

/** The reason a rejected vote was kept for, as read back. */
export function toRejectionReason(
  wire: z.output<typeof rejectionReasonSchema>,
): Result<RejectionReason, ValidationError> {
  return wire.code === VOTE_DELIVERY_ERROR_CODE.Undeliverable ? ok(wire) : toVotingError(wire);
}

/** A voting error, written. A plain copy: the wire format is the shape of the error itself. */
export function toVotingErrorWire(error: VotingError): VotingErrorWire {
  return { ...error };
}

/** A rejection reason, written. */
export function toRejectionReasonWire(reason: RejectionReason): RejectionReasonWire {
  return { ...reason };
}
