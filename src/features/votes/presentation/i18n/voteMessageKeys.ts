import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import type { AcknowledgeRejectedVoteError } from '@features/votes/application/use-cases/AcknowledgeRejectedVote';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import type { CastVoteError, CastVoteStatus } from '@features/votes/application/use-cases/CastVote';
import type { DiscardUnreadableVotesError } from '@features/votes/application/use-cases/DiscardUnreadableVotes';
import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import type { AlreadyVotedSource, VotingError } from '@features/votes/domain/errors/VotingError';

// The domain and the application speak in codes (a status, an error code) and carry no text. These
// maps are where a code of the votes becomes a translation key. Each is typed over the whole set of
// its codes, so a code added to the domain without a text fails the typecheck, and
// `as const satisfies` keeps each value a literal key, which is what `t` wants. A test checks that
// every key exists in every language.

/**
 * The code of a failure that is not an error of the use case an action called (a bug rejects with
 * something else): the actions read it as `unexpected`, so their maps carry it next to the codes of
 * their use case.
 */
type OrUnexpected<Code extends string> = Code | typeof REPOSITORY_ERROR_CODE.Unexpected;

/**
 * Why a vote cannot be cast, or was rejected. The wording is the same whether the rule is told
 * before the vote (the resolution is closed) or after (the server refused it). `alreadyVoted` also
 * depends on where the earlier vote is: see `ALREADY_VOTED_KEYS`.
 */
export const VOTING_REASON_KEYS = {
  [VOTING_ERROR_CODE.ResolutionNotFound]: 'voting.reason.resolutionNotFound',
  [VOTING_ERROR_CODE.NotAParticipant]: 'voting.reason.notAParticipant',
  [VOTING_ERROR_CODE.NoVotingRights]: 'voting.reason.noVotingRights',
  [VOTING_ERROR_CODE.ResolutionClosed]: 'voting.reason.resolutionClosed',
  [VOTING_ERROR_CODE.VotingWindowOver]: 'voting.reason.votingWindowOver',
  [VOTING_ERROR_CODE.AlreadyVoted]: 'voting.reason.alreadyVotedRecorded',
} as const satisfies Record<VotingError['code'], TranslationKey>;

/** The earlier vote of the voter is recorded by the server, or still waits to be sent. */
export const ALREADY_VOTED_KEYS = {
  [ALREADY_VOTED_SOURCE.Recorded]: 'voting.reason.alreadyVotedRecorded',
  [ALREADY_VOTED_SOURCE.Queued]: 'voting.reason.alreadyVotedQueued',
} as const satisfies Record<AlreadyVotedSource, TranslationKey>;

/**
 * What a cast vote leaves to say once the choices are gone. A vote that the server recorded is told
 * once, by a message of the screen. A vote that waits to be sent is not told by a message that
 * outlives the wait: the state of the resolution says it for as long as it is true (see
 * `ResolutionVoting`), so that the words go when the vote is sent or refused.
 */
export const CAST_OUTCOME_KEYS = {
  [CAST_VOTE_STATUS.Submitted]: 'voting.submitted',
  [CAST_VOTE_STATUS.Queued]: undefined,
} as const satisfies Record<CastVoteStatus, TranslationKey | undefined>;

/** Every way casting a vote can fail, and what the confirmation says about it. */
export const CAST_VOTE_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unauthorized]: 'errors.unauthorized',
  [REPOSITORY_ERROR_CODE.Forbidden]: 'errors.forbidden',
  [REPOSITORY_ERROR_CODE.NotFound]: 'errors.notFound',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [STORAGE_ERROR_CODE.WriteFailed]: 'voting.failure.storageWriteFailed',
  [VOTING_ERROR_CODE.ResolutionNotFound]: 'voting.reason.resolutionNotFound',
  [VOTING_ERROR_CODE.NotAParticipant]: 'voting.reason.notAParticipant',
  [VOTING_ERROR_CODE.NoVotingRights]: 'voting.reason.noVotingRights',
  [VOTING_ERROR_CODE.ResolutionClosed]: 'voting.reason.resolutionClosed',
  [VOTING_ERROR_CODE.VotingWindowOver]: 'voting.reason.votingWindowOver',
  [VOTING_ERROR_CODE.AlreadyVoted]: 'voting.reason.alreadyVotedRecorded',
  [BIOMETRIC_ERROR_CODE.Unavailable]: 'voteBiometric.biometricUnavailable',
  [BIOMETRIC_ERROR_CODE.NotEnrolled]: 'voteBiometric.biometricNotEnrolled',
  [BIOMETRIC_ERROR_CODE.Cancelled]: 'voteBiometric.biometricCancelled',
  [BIOMETRIC_ERROR_CODE.Failed]: 'voteBiometric.biometricFailed',
  [BIOMETRIC_ERROR_CODE.LockedOut]: 'voteBiometric.biometricLockedOut',
  [VOTE_DELIVERY_ERROR_CODE.InProgress]: 'voting.failure.voteInProgress',
  [VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected]: 'voting.failure.votePreviouslyRejected',
} as const satisfies Record<CastVoteError['code'], TranslationKey>;

/** Every way discarding the unreadable entries of the outbox can fail. */
export const DISCARD_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [STORAGE_ERROR_CODE.WriteFailed]: 'pendingVotes.discardFailed',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
} as const satisfies Record<OrUnexpected<DiscardUnreadableVotesError['code']>, TranslationKey>;

/** Every way acknowledging a rejected vote can fail. */
export const ACKNOWLEDGE_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [STORAGE_ERROR_CODE.WriteFailed]: 'voting.failure.storageWriteFailed',
  [VOTE_DELIVERY_ERROR_CODE.NotRejected]: 'voting.failure.voteNotRejected',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
} as const satisfies Record<OrUnexpected<AcknowledgeRejectedVoteError['code']>, TranslationKey>;
