import { BIOMETRIC_REASON } from '@application/ports/BiometricGate';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { PARTICIPANT_ROLE } from '@domain/entities/Participant';
import type { ParticipantRole } from '@domain/entities/Participant';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE, VALIDATION_RULE } from '@domain/errors/ValidationError';
import { VOTE_DELIVERY_ERROR_CODE } from '@domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { VOTING_STATE } from '@domain/policies/votingState';
import { valuesOf } from '@domain/shared/constants';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { SUPPORTED_LANGUAGES } from './constants';
import { createI18n } from './createI18n';
import {
  ACKNOWLEDGE_ERROR_KEYS,
  ALREADY_VOTED_KEYS,
  BIOMETRIC_PROMPT_KEYS,
  CAST_VOTE_ERROR_KEYS,
  CONFIDENTIALITY_KEYS,
  EMAIL_RULE_KEYS,
  EMPTY_LIST_KEYS,
  MEETINGS_ERROR_KEYS,
  MEETING_PERIOD_KEYS,
  PARTICIPANT_ROLE_KEYS,
  PASSWORD_RULE_KEYS,
  SIGN_IN_ERROR_KEYS,
  UNLOCK_ERROR_KEYS,
  VOTE_BIOMETRIC_KEYS,
  VOTE_CHOICE_KEYS,
  VOTING_DATE_KEYS,
  VOTING_REASON_KEYS,
  VOTING_STATE_KEYS,
} from './translationKeys';
import type { TranslationKey } from './translationKeys';

/** Every map, with the codes it must cover. */
const MAPS = {
  PARTICIPANT_ROLE_KEYS: [PARTICIPANT_ROLE_KEYS, valuesOf(PARTICIPANT_ROLE)],
  BIOMETRIC_PROMPT_KEYS: [BIOMETRIC_PROMPT_KEYS, valuesOf(BIOMETRIC_REASON)],
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
  SIGN_IN_ERROR_KEYS: [
    SIGN_IN_ERROR_KEYS,
    [
      VALIDATION_ERROR_CODE.Validation,
      AUTHENTICATION_ERROR_CODE.InvalidCredentials,
      REPOSITORY_ERROR_CODE.NetworkUnavailable,
      REPOSITORY_ERROR_CODE.Unexpected,
      STORAGE_ERROR_CODE.WriteFailed,
    ],
  ],
  EMAIL_RULE_KEYS: [EMAIL_RULE_KEYS, valuesOf(VALIDATION_RULE)],
  PASSWORD_RULE_KEYS: [PASSWORD_RULE_KEYS, valuesOf(VALIDATION_RULE)],
  UNLOCK_ERROR_KEYS: [
    UNLOCK_ERROR_KEYS,
    [...valuesOf(BIOMETRIC_ERROR_CODE), REPOSITORY_ERROR_CODE.Unexpected],
  ],
  VOTE_BIOMETRIC_KEYS: [VOTE_BIOMETRIC_KEYS, valuesOf(BIOMETRIC_ERROR_CODE)],
  VOTING_REASON_KEYS: [VOTING_REASON_KEYS, valuesOf(VOTING_ERROR_CODE)],
  ALREADY_VOTED_KEYS: [ALREADY_VOTED_KEYS, valuesOf(ALREADY_VOTED_SOURCE)],
  CAST_VOTE_ERROR_KEYS: [
    CAST_VOTE_ERROR_KEYS,
    [
      ...valuesOf(REPOSITORY_ERROR_CODE),
      ...valuesOf(VOTING_ERROR_CODE),
      ...valuesOf(BIOMETRIC_ERROR_CODE),
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
      AUTHENTICATION_ERROR_CODE.SessionExpired,
      AUTHENTICATION_ERROR_CODE.AppLocked,
      AUTHENTICATION_ERROR_CODE.SessionChanged,
      ...valuesOf(STORAGE_ERROR_CODE),
      VOTE_DELIVERY_ERROR_CODE.InProgress,
      VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected,
    ],
  ],
  ACKNOWLEDGE_ERROR_KEYS: [
    ACKNOWLEDGE_ERROR_KEYS,
    [
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
      AUTHENTICATION_ERROR_CODE.SessionExpired,
      AUTHENTICATION_ERROR_CODE.AppLocked,
      ...valuesOf(STORAGE_ERROR_CODE),
      VOTE_DELIVERY_ERROR_CODE.NotRejected,
      REPOSITORY_ERROR_CODE.Unexpected,
    ],
  ],
} as const satisfies Record<string, readonly [Record<string, TranslationKey>, readonly string[]]>;

/**
 * The maps that tell several codes with one text, on purpose, and how many codes share it: the
 * dates of a closed vote and of a vote whose window is over, and the rules a field of text cannot
 * break, which have no message of their own and take the nearest one.
 */
const SHARED_TEXTS: Readonly<Record<string, number>> = {
  VOTING_DATE_KEYS: 1,
  EMAIL_RULE_KEYS: 4,
  PASSWORD_RULE_KEYS: 6,
};

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
      const told = SHARED_TEXTS[name] ?? 0;

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
