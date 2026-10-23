import type { TFunction } from 'i18next';

import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import type { RejectionReason } from '@features/votes/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import type { VotingError } from '@features/votes/domain/errors/VotingError';
import { translateCount } from '@core/presentation/i18n/translateCount';
import type { CastVoteError } from '@features/votes/application/use-cases/CastVote';
import { ALREADY_VOTED_KEYS, CAST_VOTE_ERROR_KEYS, VOTING_REASON_KEYS } from './voteMessageKeys';

/**
 * Why a vote cannot be cast or was refused, in words. `alreadyVoted` depends on where the earlier
 * vote is (recorded by the server, or still waiting to be sent), which a map of codes cannot say.
 */
export function votingReasonText(t: TFunction, error: VotingError): string {
  return error.code === VOTING_ERROR_CODE.AlreadyVoted
    ? t(ALREADY_VOTED_KEYS[error.source])
    : t(VOTING_REASON_KEYS[error.code]);
}

/**
 * Why a vote ended rejected, in words: a rule of the vote, or the app giving up after a number of
 * attempts (a count, written in the language of the user).
 */
export function rejectionReasonText(
  t: TFunction,
  reason: RejectionReason,
  formatNumber: (value: number) => string,
): string {
  return reason.code === VOTE_DELIVERY_ERROR_CODE.Undeliverable
    ? translateCount(t, 'voting.reason.voteUndeliverable', reason.attempts, formatNumber)
    : votingReasonText(t, reason);
}

/** What the confirmation of a vote says when casting it failed. */
export function castVoteErrorText(t: TFunction, error: CastVoteError): string {
  return error.code === VOTING_ERROR_CODE.AlreadyVoted
    ? t(ALREADY_VOTED_KEYS[error.source])
    : t(CAST_VOTE_ERROR_KEYS[error.code]);
}
