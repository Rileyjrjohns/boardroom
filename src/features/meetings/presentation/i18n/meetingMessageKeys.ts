import type { ValidationError } from '@core/domain/errors/ValidationError';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { CORE_ERROR_KEYS } from '@core/presentation/i18n/translationKeys';
import { SESSION_ERROR_KEYS } from '@features/auth/presentation/i18n/authMessageKeys';
import type { GetMeetingError } from '@features/meetings/application/use-cases/GetMeeting';
import type { ListMeetingsError } from '@features/meetings/application/use-cases/ListMeetings';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import type { ConfidentialityLevel } from '@features/meetings/domain/entities/Document';
import { PARTICIPANT_ROLE } from '@features/meetings/domain/entities/Participant';
import type { ParticipantRole } from '@features/meetings/domain/entities/Participant';
import { VOTING_STATE } from '@features/meetings/domain/policies/votingState';
import type { VotingState } from '@features/meetings/domain/policies/votingState';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';

// The domain and the application speak in codes (a role, a status, an error code) and carry no
// text. These maps are where a code of the meetings becomes a translation key. Each is typed over
// the whole set of its codes, so a code added to the domain without a text fails the typecheck, and
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

/**
 * What each of them says: the failures of the core, and the failures of the session (the session is
 * the business of `auth`, which declares what they say). A screen shows them the way every screen
 * does, through the catalog of errors of the app.
 */
export const MEETINGS_ERROR_KEYS = {
  ...CORE_ERROR_KEYS,
  ...SESSION_ERROR_KEYS,
} as const satisfies Record<MeetingsErrorCode, TranslationKey>;
