import type { AppError } from '@core/domain/errors/AppError';
import {
  forbidden,
  networkUnavailable,
  unauthorized,
  unexpected,
} from '@core/domain/errors/RepositoryError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { valuesOf } from '@core/domain/shared/constants';
import { appLocked } from '@features/auth/domain/errors/AuthenticationError';
import { biometricFailed } from '@features/auth/domain/errors/BiometricError';
import { aResolutionId } from '@testing/domain/builders';

import {
  VOTE_DELIVERY_ERROR_CODE,
  voteInProgress,
  voteNotRejected,
  votePreviouslyRejected,
  voteUndeliverable,
} from './VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE, isVotingError } from './VotingError';
import type { VotingError } from './VotingError';

describe('vote delivery errors', () => {
  it('carry the structured data of the situation', () => {
    expect(voteUndeliverable(5)).toEqual({
      code: VOTE_DELIVERY_ERROR_CODE.Undeliverable,
      attempts: 5,
    });
    expect(votePreviouslyRejected(voteUndeliverable(2))).toEqual({
      code: VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected,
      reason: voteUndeliverable(2),
    });
    expect(voteInProgress()).toEqual({ code: VOTE_DELIVERY_ERROR_CODE.InProgress });
    expect(voteNotRejected()).toEqual({ code: VOTE_DELIVERY_ERROR_CODE.NotRejected });
  });

  it('are not business rejections of the server', () => {
    expect(isVotingError(voteUndeliverable(1))).toBe(false);
    expect(isVotingError(voteInProgress())).toBe(false);
  });
});

describe('isVotingError', () => {
  const votingErrors: readonly VotingError[] = [
    { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId() },
    { code: VOTING_ERROR_CODE.NotAParticipant },
    { code: VOTING_ERROR_CODE.NoVotingRights },
    { code: VOTING_ERROR_CODE.ResolutionClosed },
    { code: VOTING_ERROR_CODE.VotingWindowOver },
    { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
  ];

  it('recognises every voting error', () => {
    expect(votingErrors.map(isVotingError)).toEqual(votingErrors.map(() => true));
    expect(votingErrors).toHaveLength(valuesOf(VOTING_ERROR_CODE).length);
  });

  it.each<AppError>([
    networkUnavailable(),
    unauthorized(),
    forbidden(),
    appLocked(),
    unexpected(),
    biometricFailed(),
    storageReadFailed(),
  ])('rejects the error %p of another family', (error) => {
    expect(isVotingError(error)).toBe(false);
  });
});
