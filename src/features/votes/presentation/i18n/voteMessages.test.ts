import { BIOMETRIC_ERROR_CODE } from '@core/domain/errors/BiometricError';
import {
  VOTE_DELIVERY_ERROR_CODE,
  votePreviouslyRejected,
  voteUndeliverable,
} from '@core/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import { valuesOf } from '@core/domain/shared/constants';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import { aResolutionId } from '@testing/domain/builders';

import { castVoteErrorText, rejectionReasonText, votingReasonText } from './voteMessages';

const number = (value: number): string => String(value);

describe('votingReasonText', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'tells every rule of the vote in %s, each with its own text',
    (language) => {
      const { t } = createI18n(language);
      const texts = [
        votingReasonText(t, {
          code: VOTING_ERROR_CODE.ResolutionNotFound,
          resolutionId: aResolutionId(),
        }),
        votingReasonText(t, { code: VOTING_ERROR_CODE.NotAParticipant }),
        votingReasonText(t, { code: VOTING_ERROR_CODE.NoVotingRights }),
        votingReasonText(t, { code: VOTING_ERROR_CODE.ResolutionClosed }),
        votingReasonText(t, { code: VOTING_ERROR_CODE.VotingWindowOver }),
        votingReasonText(t, {
          code: VOTING_ERROR_CODE.AlreadyVoted,
          source: ALREADY_VOTED_SOURCE.Recorded,
        }),
        votingReasonText(t, {
          code: VOTING_ERROR_CODE.AlreadyVoted,
          source: ALREADY_VOTED_SOURCE.Queued,
        }),
      ];

      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) expect(text).not.toMatch(/^voting\./);
    },
  );

  it('tells a vote already cast differently when it waits to be sent', () => {
    const { t } = createI18n('en');

    expect(
      votingReasonText(t, {
        code: VOTING_ERROR_CODE.AlreadyVoted,
        source: ALREADY_VOTED_SOURCE.Queued,
      }),
    ).toBe('You have already voted on this resolution. Your vote is waiting to be sent.');
  });
});

describe('rejectionReasonText', () => {
  it('tells a rule of the vote the way the rules are told', () => {
    const { t } = createI18n('en');

    expect(rejectionReasonText(t, { code: VOTING_ERROR_CODE.ResolutionClosed }, number)).toBe(
      'Voting is closed on this resolution.',
    );
  });

  it.each([
    ['en', 1, 'Your vote could not be delivered after 1 attempt.'],
    ['en', 5, 'Your vote could not be delivered after 5 attempts.'],
    ['fr', 1, 'Votre vote n’a pas pu être transmis après 1 tentative.'],
    ['fr', 5, 'Votre vote n’a pas pu être transmis après 5 tentatives.'],
  ] as const)(
    'counts the attempts of a vote that was given up, in %s: %i',
    (language, attempts, text) => {
      const { t } = createI18n(language);

      expect(rejectionReasonText(t, voteUndeliverable(attempts), number)).toBe(text);
    },
  );
});

describe('castVoteErrorText', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'has a text in %s for every biometric outcome, each its own',
    (language) => {
      const { t } = createI18n(language);
      const texts = valuesOf(BIOMETRIC_ERROR_CODE).map((code) => castVoteErrorText(t, { code }));

      expect(new Set(texts).size).toBe(texts.length);
      for (const text of texts) expect(text).not.toMatch(/^voteBiometric\./);
    },
  );

  it('tells a vote already cast by where it is', () => {
    const { t } = createI18n('en');

    expect(
      castVoteErrorText(t, {
        code: VOTING_ERROR_CODE.AlreadyVoted,
        source: ALREADY_VOTED_SOURCE.Queued,
      }),
    ).toBe('You have already voted on this resolution. Your vote is waiting to be sent.');
    expect(
      castVoteErrorText(t, {
        code: VOTING_ERROR_CODE.AlreadyVoted,
        source: ALREADY_VOTED_SOURCE.Recorded,
      }),
    ).toBe('You have already voted on this resolution. A vote is final.');
  });

  it('tells a vote in progress and a vote that was rejected before', () => {
    const { t } = createI18n('en');

    expect(castVoteErrorText(t, { code: VOTE_DELIVERY_ERROR_CODE.InProgress })).toBe(
      'A vote on this resolution is already being cast.',
    );
    expect(
      castVoteErrorText(t, votePreviouslyRejected({ code: VOTING_ERROR_CODE.ResolutionClosed })),
    ).toBe('An earlier vote on this resolution was rejected. Acknowledge it before voting again.');
  });
});
