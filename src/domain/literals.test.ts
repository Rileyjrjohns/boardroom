import { CONFIDENTIALITY_LEVEL } from './entities/Document';
import { OUTBOX_STATUS } from './entities/OutboxVote';
import { PARTICIPANT_ROLE } from './entities/Participant';
import { RESOLUTION_STATUS } from './entities/Resolution';
import { idempotencyKeyOf } from './entities/Vote';
import { AUTHENTICATION_ERROR_CODE } from './errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from './errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from './errors/RepositoryError';
import { SCREEN_PROTECTION_ERROR_CODE } from './errors/ScreenProtectionError';
import { STORAGE_ERROR_CODE } from './errors/StorageError';
import { VALIDATION_ERROR_CODE, VALIDATION_FIELD, VALIDATION_RULE } from './errors/ValidationError';
import { VOTE_DELIVERY_ERROR_CODE } from './errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from './errors/VotingError';
import { aResolutionId, aUserId } from './testing/builders';
import { MEETING_PERIOD } from './value-objects/MeetingPeriod';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from './value-objects/PageRequest';
import { VOTE_CHOICE } from './value-objects/VoteChoice';

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
    });
    expect(REPOSITORY_ERROR_CODE).toEqual({
      NetworkUnavailable: 'networkUnavailable',
      NotFound: 'notFound',
      Unauthorized: 'unauthorized',
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
