import type { AuthenticationError } from './AuthenticationError';
import type { BiometricError } from './BiometricError';
import type { RepositoryError } from './RepositoryError';
import type { ScreenProtectionError } from './ScreenProtectionError';
import type { StorageError } from './StorageError';
import type { ValidationError } from './ValidationError';
import type {
  VoteInProgressError,
  VoteNotRejectedError,
  VotePreviouslyRejectedError,
  VoteUndeliverableError,
} from './VoteDeliveryError';
import type { VotingError } from './VotingError';

/**
 * Every error the domain defines. The `code` of each member is unique across the union (a test
 * checks it), so a union of errors from several concerns can be told apart by `code` alone.
 */
export type AppError =
  | ValidationError
  | AuthenticationError
  | RepositoryError
  | VotingError
  | BiometricError
  | StorageError
  | ScreenProtectionError
  | VoteUndeliverableError
  | VotePreviouslyRejectedError
  | VoteInProgressError
  | VoteNotRejectedError;
