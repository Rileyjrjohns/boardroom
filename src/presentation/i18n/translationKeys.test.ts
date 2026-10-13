import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import type { ParticipantRole } from '@domain/entities/Participant';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@domain/errors/ValidationError';
import { VOTING_STATE } from '@domain/policies/votingState';
import { valuesOf } from '@domain/shared/constants';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { SUPPORTED_LANGUAGES } from './constants';
import { createI18n } from './createI18n';
import {
  CONFIDENTIALITY_KEYS,
  EMPTY_LIST_KEYS,
  MEETINGS_ERROR_KEYS,
  MEETING_PERIOD_KEYS,
  PARTICIPANT_ROLE_KEYS,
  VOTE_CHOICE_KEYS,
  VOTING_DATE_KEYS,
  VOTING_STATE_KEYS,
} from './translationKeys';
import type { TranslationKey } from './translationKeys';

/** Every map, with the codes it must cover. */
const MAPS = {
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
} as const satisfies Record<string, readonly [Record<string, TranslationKey>, readonly string[]]>;

describe('the maps from codes to translation keys', () => {
  describe.each(Object.entries(MAPS))('%s', (name, [map, codes]) => {
    it('has an entry for every code, and for nothing else', () => {
      expect(Object.keys(map).sort()).toEqual([...codes].sort());
    });

    it.each(SUPPORTED_LANGUAGES)('has a translation in %s for every entry', (language) => {
      const { exists } = createI18n(language);

      for (const key of Object.values(map)) {
        expect(exists(key)).toBe(true);
      }
    });

    it('gives each code its own text, unless the map says two states are told the same way', () => {
      const keys = Object.values(map);
      const told = name === 'VOTING_DATE_KEYS' ? 1 : 0;

      expect(new Set(keys).size).toBe(keys.length - told);
    });
  });

  it('translates a code the way the screens do', () => {
    const { t } = createI18n('fr');

    expect(t(PARTICIPANT_ROLE_KEYS[PARTICIPANT_ROLE.Chair])).toBe('Président');
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
