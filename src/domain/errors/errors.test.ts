import type { AppError } from './AppError';
import {
  AUTHENTICATION_ERROR_CODE,
  invalidCredentials,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from './AuthenticationError';
import {
  BIOMETRIC_ERROR_CODE,
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from './BiometricError';
import {
  REPOSITORY_ERROR_CODE,
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from './RepositoryError';
import {
  SCREEN_PROTECTION_ERROR_CODE,
  screenProtectionFailed,
  screenProtectionUnsupported,
} from './ScreenProtectionError';
import { STORAGE_ERROR_CODE, storageReadFailed, storageWriteFailed } from './StorageError';
import {
  VALIDATION_ERROR_CODE,
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from './ValidationError';
import {
  VOTE_DELIVERY_ERROR_CODE,
  voteInProgress,
  voteNotRejected,
  votePreviouslyRejected,
  voteUndeliverable,
} from './VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE, isVotingError } from './VotingError';
import type { VotingError } from './VotingError';
import { aResolutionId } from '../testing/builders';
import { valuesOf } from '../shared/constants';

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

describe('error factories', () => {
  it('build a validation error with its field and rule', () => {
    expect(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.Required)).toEqual({
      code: VALIDATION_ERROR_CODE.Validation,
      field: VALIDATION_FIELD.Email,
      rule: VALIDATION_RULE.Required,
    });
  });

  it('build the authentication errors', () => {
    expect(invalidCredentials().code).toBe(AUTHENTICATION_ERROR_CODE.InvalidCredentials);
    expect(sessionExpired().code).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);
    expect(notAuthenticated().code).toBe(AUTHENTICATION_ERROR_CODE.NotAuthenticated);
    expect(sessionChanged().code).toBe(AUTHENTICATION_ERROR_CODE.SessionChanged);
  });

  it('build the repository errors', () => {
    expect(networkUnavailable().code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
    expect(notFound().code).toBe(REPOSITORY_ERROR_CODE.NotFound);
    expect(unauthorized().code).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
  });

  it('carry a technical cause only when one is given', () => {
    expect(unexpected()).toEqual({ code: REPOSITORY_ERROR_CODE.Unexpected });
    expect(unexpected('HTTP 500')).toEqual({
      code: REPOSITORY_ERROR_CODE.Unexpected,
      cause: 'HTTP 500',
    });
    expect(storageReadFailed()).toEqual({ code: STORAGE_ERROR_CODE.ReadFailed });
    expect(storageReadFailed('disk')).toEqual({
      code: STORAGE_ERROR_CODE.ReadFailed,
      cause: 'disk',
    });
    expect(storageWriteFailed()).toEqual({ code: STORAGE_ERROR_CODE.WriteFailed });
    expect(storageWriteFailed('full')).toEqual({
      code: STORAGE_ERROR_CODE.WriteFailed,
      cause: 'full',
    });
  });

  it('build the biometric errors', () => {
    expect([
      biometricUnavailable().code,
      biometricNotEnrolled().code,
      biometricCancelled().code,
      biometricFailed().code,
      biometricLockedOut().code,
    ]).toEqual(valuesOf(BIOMETRIC_ERROR_CODE));
  });

  it('build the screen protection errors', () => {
    expect([screenProtectionUnsupported().code, screenProtectionFailed().code]).toEqual(
      valuesOf(SCREEN_PROTECTION_ERROR_CODE),
    );
  });
});

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
    unexpected(),
    biometricFailed(),
    storageReadFailed(),
  ])('rejects the error %p of another family', (error) => {
    expect(isVotingError(error)).toBe(false);
  });
});
