import type { ParseKeys } from 'i18next';

import type { ConfidentialityLevel } from '@domain/entities/Document';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import type { ParticipantRole } from '@domain/entities/Participant';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@domain/errors/ValidationError';
import { VOTING_STATE } from '@domain/policies/votingState';
import type { VotingState } from '@domain/policies/votingState';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';
import type { GetMeetingError } from '@application/use-cases/meetings/GetMeeting';
import type { ListMeetingsError } from '@application/use-cases/meetings/ListMeetings';
import type { ValidationError } from '@domain/errors/ValidationError';

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
