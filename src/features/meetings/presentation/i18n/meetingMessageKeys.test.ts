import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import { PARTICIPANT_ROLE } from '@features/meetings/domain/entities/Participant';
import type { ParticipantRole } from '@features/meetings/domain/entities/Participant';
import { VOTING_STATE } from '@features/meetings/domain/policies/votingState';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { describeTranslationMaps } from '@testing/presentation/translationMaps';

import {
  CONFIDENTIALITY_KEYS,
  EMPTY_LIST_KEYS,
  MEETINGS_ERROR_KEYS,
  MEETING_PERIOD_KEYS,
  PARTICIPANT_ROLE_KEYS,
  VOTE_CHOICE_KEYS,
  VOTING_DATE_KEYS,
  VOTING_STATE_KEYS,
} from './meetingMessageKeys';

describeTranslationMaps(
  {
    PARTICIPANT_ROLE_KEYS: [PARTICIPANT_ROLE_KEYS, valuesOf(PARTICIPANT_ROLE)],
    VOTING_STATE_KEYS: [VOTING_STATE_KEYS, valuesOf(VOTING_STATE)],
    VOTING_DATE_KEYS: [VOTING_DATE_KEYS, valuesOf(VOTING_STATE)],
    CONFIDENTIALITY_KEYS: [CONFIDENTIALITY_KEYS, valuesOf(CONFIDENTIALITY_LEVEL)],
    VOTE_CHOICE_KEYS: [VOTE_CHOICE_KEYS, valuesOf(VOTE_CHOICE)],
    MEETING_PERIOD_KEYS: [MEETING_PERIOD_KEYS, valuesOf(MEETING_PERIOD)],
    EMPTY_LIST_KEYS: [EMPTY_LIST_KEYS, valuesOf(MEETING_PERIOD)],
    MEETINGS_ERROR_KEYS: [
      MEETINGS_ERROR_KEYS,
      [
        ...valuesOf(REPOSITORY_ERROR_CODE),
        AUTHENTICATION_ERROR_CODE.NotAuthenticated,
        AUTHENTICATION_ERROR_CODE.SessionExpired,
        AUTHENTICATION_ERROR_CODE.AppLocked,
        AUTHENTICATION_ERROR_CODE.SessionChanged,
        STORAGE_ERROR_CODE.ReadFailed,
        VALIDATION_ERROR_CODE.Validation,
      ],
    ],
  },
  // The dates of a closed vote and of a vote whose window is over are told the same way: the
  // wording is neutral, true whether the date is ahead or behind.
  { VOTING_DATE_KEYS: 1 },
);

describe('the maps from codes to translation keys', () => {
  it('translates a code the way the screens do', () => {
    const { t } = createI18n('fr');

    expect(t(PARTICIPANT_ROLE_KEYS[PARTICIPANT_ROLE.Chair])).toBe('Présidence');
    expect(t(VOTE_CHOICE_KEYS[VOTE_CHOICE.Abstain])).toBe('Abstention');
    expect(t(VOTING_STATE_KEYS[VOTING_STATE.Closed])).toBe('Clôturée');
    expect(t(VOTING_STATE_KEYS[VOTING_STATE.WindowOver])).toBe('Délai écoulé');
    expect(t(CONFIDENTIALITY_KEYS[CONFIDENTIALITY_LEVEL.Internal])).toBe('Interne');
  });

  it('fails the typecheck when a code has no entry, or an entry has no translation', () => {
    const complete = <Map extends Record<ParticipantRole, TranslationKey>>(map: Map): Map => map;

    // @ts-expect-error A role without a translation key must fail the typecheck.
    complete({ chair: 'participantRole.chair' });
    // @ts-expect-error A key that no resource defines must fail the typecheck.
    complete({ ...PARTICIPANT_ROLE_KEYS, guest: 'participantRole.nobody' });

    expect(complete(PARTICIPANT_ROLE_KEYS)).toBe(PARTICIPANT_ROLE_KEYS);
  });
});
