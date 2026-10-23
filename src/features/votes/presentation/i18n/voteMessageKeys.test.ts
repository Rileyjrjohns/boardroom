import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { valuesOf } from '@core/domain/shared/constants';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { describeTranslationMaps } from '@testing/presentation/translationMaps';

import {
  ACKNOWLEDGE_ERROR_KEYS,
  ALREADY_VOTED_KEYS,
  CAST_OUTCOME_KEYS,
  CAST_VOTE_ERROR_KEYS,
  DISCARD_ERROR_KEYS,
  VOTING_REASON_KEYS,
} from './voteMessageKeys';

describeTranslationMaps({
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
      AUTHENTICATION_ERROR_CODE.SessionChanged,
      ...valuesOf(STORAGE_ERROR_CODE),
      VOTE_DELIVERY_ERROR_CODE.NotRejected,
      REPOSITORY_ERROR_CODE.Unexpected,
    ],
  ],
  DISCARD_ERROR_KEYS: [
    DISCARD_ERROR_KEYS,
    [
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
      AUTHENTICATION_ERROR_CODE.SessionExpired,
      AUTHENTICATION_ERROR_CODE.AppLocked,
      AUTHENTICATION_ERROR_CODE.SessionChanged,
      ...valuesOf(STORAGE_ERROR_CODE),
      REPOSITORY_ERROR_CODE.Unexpected,
    ],
  ],
});

describe('the maps from codes to translation keys', () => {
  describe('CAST_OUTCOME_KEYS', () => {
    it('has an entry for every status of a cast vote, and for nothing else', () => {
      expect(Object.keys(CAST_OUTCOME_KEYS).sort()).toEqual(Object.values(CAST_VOTE_STATUS).sort());
    });

    it('tells a recorded vote with a message, and a vote that waits with none: the resolution says that', () => {
      expect(CAST_OUTCOME_KEYS[CAST_VOTE_STATUS.Submitted]).toBe('voting.submitted');
      expect(CAST_OUTCOME_KEYS[CAST_VOTE_STATUS.Queued]).toBeUndefined();
    });

    it.each(SUPPORTED_LANGUAGES)('has the translation of the message in %s', (language) => {
      expect(createI18n(language).exists(CAST_OUTCOME_KEYS[CAST_VOTE_STATUS.Submitted])).toBe(true);
    });
  });
});
