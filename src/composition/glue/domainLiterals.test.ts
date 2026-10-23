import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@features/auth/domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { SCREEN_PROTECTION_ERROR_CODE } from '@features/documents/domain/errors/ScreenProtectionError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import {
  VALIDATION_ERROR_CODE,
  VALIDATION_FIELD,
  VALIDATION_RULE,
} from '@core/domain/errors/ValidationError';
import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '@core/domain/value-objects/PageRequest';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import { PARTICIPANT_ROLE } from '@features/meetings/domain/entities/Participant';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { OUTBOX_STATUS } from '@features/votes/domain/entities/OutboxVote';
import { idempotencyKeyOf } from '@features/votes/domain/entities/Vote';
import { aResolutionId, aUserId } from '@testing/domain/builders';

// The tests of the other files compare a constant with itself, which no change of its value could
// break. These pin the values themselves: they are stored (in SQLite, in the query cache), sent to
// the server, and mapped to translation keys, so changing one is a decision, not an accident.

describe('the values that are stored and mapped to translations', () => {
  it('are those of the vote choices, the roles, the levels and the statuses', () => {
    expect(VOTE_CHOICE).toEqual({ For: 'for', Against: 'against', Abstain: 'abstain' });
    expect(MEETING_PERIOD).toEqual({ Upcoming: 'upcoming', Past: 'past' });
    expect(PARTICIPANT_ROLE).toEqual({
      Chair: 'chair',
      Secretary: 'secretary',
      Member: 'member',
      Guest: 'guest',
    });
    expect(CONFIDENTIALITY_LEVEL).toEqual({
      Public: 'public',
      Internal: 'internal',
      Confidential: 'confidential',
    });
    expect(RESOLUTION_STATUS).toEqual({ Open: 'open', Closed: 'closed' });
    expect(OUTBOX_STATUS).toEqual({ Pending: 'pending', Rejected: 'rejected' });
  });

  it('are those of the error codes', () => {
    expect(VALIDATION_ERROR_CODE).toEqual({ Validation: 'validation' });
    expect(AUTHENTICATION_ERROR_CODE).toEqual({
      InvalidCredentials: 'invalidCredentials',
      SessionExpired: 'sessionExpired',
      NotAuthenticated: 'notAuthenticated',
      SessionChanged: 'sessionChanged',
      AppLocked: 'appLocked',
    });
    expect(REPOSITORY_ERROR_CODE).toEqual({
      NetworkUnavailable: 'networkUnavailable',
      NotFound: 'notFound',
      Unauthorized: 'unauthorized',
      Forbidden: 'forbidden',
      Unexpected: 'unexpected',
    });
    expect(VOTING_ERROR_CODE).toEqual({
      ResolutionNotFound: 'resolutionNotFound',
      NotAParticipant: 'notAParticipant',
      NoVotingRights: 'noVotingRights',
      ResolutionClosed: 'resolutionClosed',
      VotingWindowOver: 'votingWindowOver',
      AlreadyVoted: 'alreadyVoted',
    });
    expect(VOTE_DELIVERY_ERROR_CODE).toEqual({
      Undeliverable: 'voteUndeliverable',
      PreviouslyRejected: 'votePreviouslyRejected',
      InProgress: 'voteInProgress',
      NotRejected: 'voteNotRejected',
    });
    expect(BIOMETRIC_ERROR_CODE).toEqual({
      Unavailable: 'biometricUnavailable',
      NotEnrolled: 'biometricNotEnrolled',
      Cancelled: 'biometricCancelled',
      Failed: 'biometricFailed',
      LockedOut: 'biometricLockedOut',
    });
    expect(STORAGE_ERROR_CODE).toEqual({
      ReadFailed: 'storageReadFailed',
      WriteFailed: 'storageWriteFailed',
    });
    expect(SCREEN_PROTECTION_ERROR_CODE).toEqual({
      Unsupported: 'screenProtectionUnsupported',
      Failed: 'screenProtectionFailed',
    });
    expect(ALREADY_VOTED_SOURCE).toEqual({ Recorded: 'recorded', Queued: 'queued' });
  });

  it('are those of the fields and rules of a validation error', () => {
    expect(VALIDATION_RULE).toEqual({
      Required: 'required',
      TooLong: 'tooLong',
      InvalidFormat: 'invalidFormat',
      NotAnInteger: 'notAnInteger',
      OutOfRange: 'outOfRange',
      UnknownValue: 'unknownValue',
      Duplicate: 'duplicate',
    });
    expect(VALIDATION_FIELD).toEqual({
      UserId: 'userId',
      MeetingId: 'meetingId',
      AgendaItemId: 'agendaItemId',
      ResolutionId: 'resolutionId',
      DocumentId: 'documentId',
      FullName: 'fullName',
      Email: 'email',
      Password: 'password',
      Title: 'title',
      Description: 'description',
      Location: 'location',
      Position: 'position',
      PageCount: 'pageCount',
      PageLimit: 'pageLimit',
      PageCursor: 'pageCursor',
      Instant: 'instant',
      Duration: 'duration',
      DocumentLocation: 'documentLocation',
      AttemptCount: 'attemptCount',
      Agenda: 'agenda',
      Documents: 'documents',
      Participants: 'participants',
      VoteChoice: 'voteChoice',
      MeetingPeriod: 'meetingPeriod',
      ParticipantRole: 'participantRole',
      ResolutionStatus: 'resolutionStatus',
      ConfidentialityLevel: 'confidentialityLevel',
    });
  });
});

describe('the values that leave the process', () => {
  it('include the idempotency key sent to the server: the length of the resolution id, the resolution id, the voter id', () => {
    expect(idempotencyKeyOf(aResolutionId('resolution-1'), aUserId('user-1'))).toBe(
      '12.resolution-1.user-1',
    );
    expect(idempotencyKeyOf(aResolutionId('r.1'), aUserId('u:2'))).toBe('3.r.1.u:2');
  });

  it('include the page sizes asked of the server', () => {
    expect(DEFAULT_PAGE_LIMIT).toBe(20);
    expect(MAX_PAGE_LIMIT).toBe(50);
  });
});
