import type { ParseKeys } from 'i18next';

import type { BiometricReason } from '@application/ports/BiometricGate';
import { BIOMETRIC_REASON } from '@application/ports/BiometricGate';
import type { ConfidentialityLevel } from '@domain/entities/Document';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import type { ParticipantRole } from '@domain/entities/Participant';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@domain/errors/BiometricError';
import type { BiometricError } from '@domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE, VALIDATION_RULE } from '@domain/errors/ValidationError';
import type { ValidationError, ValidationRule } from '@domain/errors/ValidationError';
import { VOTE_DELIVERY_ERROR_CODE } from '@domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { AlreadyVotedSource, VotingError } from '@domain/errors/VotingError';
import { VOTING_STATE } from '@domain/policies/votingState';
import type { VotingState } from '@domain/policies/votingState';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';
import type { SignInError } from '@application/use-cases/auth/SignIn';
import type { GetMeetingError } from '@application/use-cases/meetings/GetMeeting';
import type { ListMeetingsError } from '@application/use-cases/meetings/ListMeetings';
import type { AcknowledgeRejectedVoteError } from '@application/use-cases/votes/AcknowledgeRejectedVote';
import type { CastVoteError } from '@application/use-cases/votes/CastVote';

/** A key the typed `t` accepts: the keys of the English resource. */
export type TranslationKey = ParseKeys;

// The domain and the application speak in codes (a role, a status, an error code) and carry no
// text. These maps are where a code becomes a translation key. Each is typed over the whole set of
// its codes, so a code added to the domain without a text fails the typecheck here, and
// `as const satisfies` keeps each value a literal key, which is what `t` wants. A test checks that
// every key exists in every language.

export const PARTICIPANT_ROLE_KEYS = {
  [PARTICIPANT_ROLE.Chair]: 'participantRole.chair',
  [PARTICIPANT_ROLE.Secretary]: 'participantRole.secretary',
  [PARTICIPANT_ROLE.Member]: 'participantRole.member',
  [PARTICIPANT_ROLE.Guest]: 'participantRole.guest',
} as const satisfies Record<ParticipantRole, TranslationKey>;

/** The badge of a resolution: where voting stands, not the raw status (see `getVotingState`). */
export const VOTING_STATE_KEYS = {
  [VOTING_STATE.Open]: 'votingState.open',
  [VOTING_STATE.Closed]: 'votingState.closed',
  [VOTING_STATE.WindowOver]: 'votingState.windowOver',
} as const satisfies Record<VotingState, TranslationKey>;

/**
 * The line that dates the voting of a resolution: a deadline while it is open, the date it closed
 * on otherwise. The wording is neutral: it is true whether the date is ahead or behind.
 */
export const VOTING_DATE_KEYS = {
  [VOTING_STATE.Open]: 'meeting.votingDeadline',
  [VOTING_STATE.Closed]: 'meeting.votingClosedOn',
  [VOTING_STATE.WindowOver]: 'meeting.votingClosedOn',
} as const satisfies Record<VotingState, TranslationKey>;

export const CONFIDENTIALITY_KEYS = {
  [CONFIDENTIALITY_LEVEL.Public]: 'confidentiality.public',
  [CONFIDENTIALITY_LEVEL.Internal]: 'confidentiality.internal',
  [CONFIDENTIALITY_LEVEL.Confidential]: 'confidentiality.confidential',
} as const satisfies Record<ConfidentialityLevel, TranslationKey>;

export const VOTE_CHOICE_KEYS = {
  [VOTE_CHOICE.For]: 'voteChoice.for',
  [VOTE_CHOICE.Against]: 'voteChoice.against',
  [VOTE_CHOICE.Abstain]: 'voteChoice.abstain',
} as const satisfies Record<VoteChoice, TranslationKey>;

export const MEETING_PERIOD_KEYS = {
  [MEETING_PERIOD.Upcoming]: 'meetings.period.upcoming',
  [MEETING_PERIOD.Past]: 'meetings.period.past',
} as const satisfies Record<MeetingPeriod, TranslationKey>;

/** The text shown for an empty list of each period. */
export const EMPTY_LIST_KEYS = {
  [MEETING_PERIOD.Upcoming]: 'meetings.empty.upcoming',
  [MEETING_PERIOD.Past]: 'meetings.empty.past',
} as const satisfies Record<MeetingPeriod, TranslationKey>;

/** Every error a meeting screen can meet: reading a list, reading a meeting, building the request. */
export type MeetingsErrorCode = (ListMeetingsError | GetMeetingError | ValidationError)['code'];

export const MEETINGS_ERROR_KEYS = {
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unauthorized]: 'errors.unauthorized',
  [REPOSITORY_ERROR_CODE.Forbidden]: 'errors.forbidden',
  [REPOSITORY_ERROR_CODE.NotFound]: 'errors.notFound',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [AUTHENTICATION_ERROR_CODE.SessionChanged]: 'errors.sessionChanged',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [VALIDATION_ERROR_CODE.Validation]: 'errors.validation',
} as const satisfies Record<MeetingsErrorCode, TranslationKey>;

/** The text of the system prompt that asks for a biometric proof, for each reason. */
export const BIOMETRIC_PROMPT_KEYS = {
  [BIOMETRIC_REASON.UnlockApp]: 'biometric.unlockApp',
  [BIOMETRIC_REASON.ConfirmVote]: 'biometric.confirmVote',
} as const satisfies Record<BiometricReason, TranslationKey>;

/** What a sign-in that was refused says. A badly formed field is told next to the field instead. */
export const SIGN_IN_ERROR_KEYS = {
  [VALIDATION_ERROR_CODE.Validation]: 'errors.validation',
  [AUTHENTICATION_ERROR_CODE.InvalidCredentials]: 'errors.invalidCredentials',
  [REPOSITORY_ERROR_CODE.NetworkUnavailable]: 'errors.networkUnavailable',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
  [STORAGE_ERROR_CODE.WriteFailed]: 'errors.storageWriteFailed',
} as const satisfies Record<SignInError['code'], TranslationKey>;

// What the domain says about a field of the sign-in form is a rule that the value broke. The
// email can break all of them that apply to a text or to a format; the password can only be empty.
// The rules that cannot concern a field of text are mapped to the nearest message, so that the
// maps stay exhaustive: a rule added to the domain without a message fails the typecheck here.

export const EMAIL_RULE_KEYS = {
  [VALIDATION_RULE.Required]: 'signIn.emailRequired',
  [VALIDATION_RULE.TooLong]: 'signIn.emailTooLong',
  [VALIDATION_RULE.InvalidFormat]: 'signIn.emailInvalid',
  [VALIDATION_RULE.NotAnInteger]: 'signIn.emailInvalid',
  [VALIDATION_RULE.OutOfRange]: 'signIn.emailInvalid',
  [VALIDATION_RULE.UnknownValue]: 'signIn.emailInvalid',
  [VALIDATION_RULE.Duplicate]: 'signIn.emailInvalid',
} as const satisfies Record<ValidationRule, TranslationKey>;

export const PASSWORD_RULE_KEYS = {
  [VALIDATION_RULE.Required]: 'signIn.passwordRequired',
  [VALIDATION_RULE.TooLong]: 'signIn.passwordRequired',
  [VALIDATION_RULE.InvalidFormat]: 'signIn.passwordRequired',
  [VALIDATION_RULE.NotAnInteger]: 'signIn.passwordRequired',
  [VALIDATION_RULE.OutOfRange]: 'signIn.passwordRequired',
  [VALIDATION_RULE.UnknownValue]: 'signIn.passwordRequired',
  [VALIDATION_RULE.Duplicate]: 'signIn.passwordRequired',
} as const satisfies Record<ValidationRule, TranslationKey>;

/**
 * The code of a failure that is not an error of the use case an action called (a bug rejects with
 * something else): the actions read it as `unexpected`, so their maps carry it next to the codes of
 * their use case.
 */
type OrUnexpected<Code extends string> = Code | typeof REPOSITORY_ERROR_CODE.Unexpected;

/** What each outcome of the biometric prompt says on the lock screen. */
export const UNLOCK_ERROR_KEYS = {
  [BIOMETRIC_ERROR_CODE.Unavailable]: 'unlockErrors.biometricUnavailable',
  [BIOMETRIC_ERROR_CODE.NotEnrolled]: 'unlockErrors.biometricNotEnrolled',
  [BIOMETRIC_ERROR_CODE.Cancelled]: 'unlockErrors.biometricCancelled',
  [BIOMETRIC_ERROR_CODE.Failed]: 'unlockErrors.biometricFailed',
  [BIOMETRIC_ERROR_CODE.LockedOut]: 'unlockErrors.biometricLockedOut',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
} as const satisfies Record<OrUnexpected<BiometricError['code']>, TranslationKey>;

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

/** What the confirmation of a vote says for each outcome of the biometric prompt. */
export const VOTE_BIOMETRIC_KEYS = {
  [BIOMETRIC_ERROR_CODE.Unavailable]: 'voteBiometric.biometricUnavailable',
  [BIOMETRIC_ERROR_CODE.NotEnrolled]: 'voteBiometric.biometricNotEnrolled',
  [BIOMETRIC_ERROR_CODE.Cancelled]: 'voteBiometric.biometricCancelled',
  [BIOMETRIC_ERROR_CODE.Failed]: 'voteBiometric.biometricFailed',
  [BIOMETRIC_ERROR_CODE.LockedOut]: 'voteBiometric.biometricLockedOut',
} as const satisfies Record<BiometricError['code'], TranslationKey>;

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

/** Every way acknowledging a rejected vote can fail. */
export const ACKNOWLEDGE_ERROR_KEYS = {
  [AUTHENTICATION_ERROR_CODE.NotAuthenticated]: 'errors.notAuthenticated',
  [AUTHENTICATION_ERROR_CODE.SessionExpired]: 'errors.sessionExpired',
  [AUTHENTICATION_ERROR_CODE.AppLocked]: 'errors.appLocked',
  [STORAGE_ERROR_CODE.ReadFailed]: 'errors.storageReadFailed',
  [STORAGE_ERROR_CODE.WriteFailed]: 'voting.failure.storageWriteFailed',
  [VOTE_DELIVERY_ERROR_CODE.NotRejected]: 'voting.failure.voteNotRejected',
  [REPOSITORY_ERROR_CODE.Unexpected]: 'errors.unexpected',
} as const satisfies Record<OrUnexpected<AcknowledgeRejectedVoteError['code']>, TranslationKey>;
