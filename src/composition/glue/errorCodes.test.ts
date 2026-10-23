import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';
import { valuesOf } from '@core/domain/shared/constants';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';
import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';

// The families of errors are declared where they belong (the core, `auth`, `votes`, `documents`),
// and only the composition sees them all: this is the one place that can say their codes never
// collide.

describe('error codes', () => {
  const families = {
    validation: valuesOf(VALIDATION_ERROR_CODE),
    authentication: valuesOf(AUTHENTICATION_ERROR_CODE),
    repository: valuesOf(REPOSITORY_ERROR_CODE),
    voting: valuesOf(VOTING_ERROR_CODE),
    voteDelivery: valuesOf(VOTE_DELIVERY_ERROR_CODE),
    biometric: valuesOf(BIOMETRIC_ERROR_CODE),
    storage: valuesOf(STORAGE_ERROR_CODE),
    screenProtection: valuesOf(SCREEN_PROTECTION_ERROR_CODE),
  };

  it('are unique across every family, so that a union of errors is told apart by code alone', () => {
    const all = Object.values(families).flat();

    expect(new Set(all).size).toBe(all.length);
  });
});
