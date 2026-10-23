import type { Brand } from '@core/domain/shared/Brand';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { MeetingId, ResolutionId, UserId } from '@core/domain/value-objects/ids';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';

/**
 * Identifies a vote for the remote source, which uses it to recognise a vote it already has:
 * sending the same vote twice (a retry after a lost answer) records it once. Derived from the
 * resolution and the voter, because a member votes once per resolution. The meeting is not part of
 * the key: resolution ids are globally unique (see `ResolutionId`), so the resolution says which
 * meeting the vote is for.
 */
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

/** Separates the length of the resolution id, the resolution id and the voter id in the key. */
const KEY_SEPARATOR = '.';

/**
 * The key of the vote of `voterId` on `resolutionId`: `<length of the resolution id>.<resolution
 * id>.<voter id>`. Deterministic (same inputs, same key), it cannot throw (it only concatenates),
 * and two different pairs never give the same key: the length says where the resolution id ends, so
 * whatever characters the ids contain (separators included), the key can be read back unambiguously.
 */
export function idempotencyKeyOf(resolutionId: ResolutionId, voterId: UserId): IdempotencyKey {
  const key = [resolutionId.length, resolutionId, voterId].join(KEY_SEPARATOR);
  return key as IdempotencyKey;
}

/** A vote that has been cast. It is final: there is no way to change it. */
export interface Vote {
  readonly resolutionId: ResolutionId;
  readonly meetingId: MeetingId;
  readonly voterId: UserId;
  readonly choice: VoteChoice;
  readonly castAt: Instant;
  readonly idempotencyKey: IdempotencyKey;
}

export interface VoteInput {
  readonly resolutionId: ResolutionId;
  readonly meetingId: MeetingId;
  readonly voterId: UserId;
  readonly choice: VoteChoice;
  readonly castAt: Instant;
}

/**
 * Builds a vote. It cannot fail: every field is already a validated value. Whether the voter may
 * vote is the business of `checkVotingEligibility`, which runs before.
 */
export function createVote(input: VoteInput): Vote {
  return {
    resolutionId: input.resolutionId,
    meetingId: input.meetingId,
    voterId: input.voterId,
    choice: input.choice,
    castAt: input.castAt,
    idempotencyKey: idempotencyKeyOf(input.resolutionId, input.voterId),
  };
}
