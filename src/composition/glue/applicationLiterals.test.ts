import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { FRESHNESS } from '@core/application/offline/Loaded';
import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { SESSION_RESTORE } from '@features/auth/application/use-cases/RestoreSession';
import { SCREEN_CAPTURE_KIND } from '@features/documents/application/ports/ScreenProtection';
import { ENQUEUE_OUTCOME } from '@features/votes/application/ports/VoteOutbox';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import { SYNC_OUTCOME } from '@features/votes/application/use-cases/SyncPendingVotes';

// The values that are logged, stored or mapped to a prompt, pinned as strings: a test that compares
// a constant with itself would not notice a change.

describe('the values of the application', () => {
  it('are those of the results and statuses the presentation reads', () => {
    expect(FRESHNESS).toEqual({ Fresh: 'fresh', Stale: 'stale' });
    expect(CAST_VOTE_STATUS).toEqual({ Submitted: 'submitted', Queued: 'queued' });
    expect(SYNC_OUTCOME).toEqual({
      Completed: 'completed',
      Interrupted: 'interrupted',
      AlreadyRunning: 'alreadyRunning',
    });
    expect(SESSION_RESTORE).toEqual({ None: 'none', UnlockRequired: 'unlockRequired' });
    expect(ENQUEUE_OUTCOME).toEqual({
      Enqueued: 'enqueued',
      AlreadyQueued: 'alreadyQueued',
      HeldByUnreadable: 'heldByUnreadable',
    });
  });

  it('are those of the reasons and kinds that cross the ports', () => {
    expect(BIOMETRIC_REASON).toEqual({ UnlockApp: 'unlockApp', ConfirmVote: 'confirmVote' });
    expect(CONNECTIVITY_STATUS).toEqual({ Online: 'online', Offline: 'offline' });
    expect(SCREEN_CAPTURE_KIND).toEqual({
      ScreenshotTaken: 'screenshotTaken',
      RecordingStarted: 'recordingStarted',
      RecordingStopped: 'recordingStopped',
    });
  });

  it('are those of the monitoring vocabulary', () => {
    expect(LOG_LEVEL).toEqual({ Info: 'info', Warn: 'warn' });
    expect(CACHE_RESOURCE).toEqual({
      MeetingPage: 'meetingPage',
      Meeting: 'meeting',
      Document: 'document',
    });
    expect(MONITORING_EVENT).toEqual({
      SessionExpired: 'sessionExpired',
      SignOutFailed: 'signOutFailed',
      CacheReadFailed: 'cacheReadFailed',
      CacheWriteFailed: 'cacheWriteFailed',
      CacheRemoveFailed: 'cacheRemoveFailed',
      CachePurgeFailed: 'cachePurgeFailed',
      CacheEntryDiscarded: 'cacheEntryDiscarded',
      ServedFromCache: 'servedFromCache',
      DocumentContentNotStored: 'documentContentNotStored',
      OrphanFileNotDeleted: 'orphanFileNotDeleted',
      DocumentOpened: 'documentOpened',
      ScreenCaptureDetected: 'screenCaptureDetected',
      VoteSubmitted: 'voteSubmitted',
      VoteSubmitFailed: 'voteSubmitFailed',
      VoteQueued: 'voteQueued',
      VoteEnqueueFailed: 'voteEnqueueFailed',
      VoteRejected: 'voteRejected',
      VoteAttemptNotRecorded: 'voteAttemptNotRecorded',
      VoteSyncCompleted: 'voteSyncCompleted',
      VoteSyncInterrupted: 'voteSyncInterrupted',
      OutboxReadFailed: 'outboxReadFailed',
      StoredRowDiscarded: 'storedRowDiscarded',
      StoredRowQuarantined: 'storedRowQuarantined',
      ResponseInvalid: 'responseInvalid',
      DatabaseRecreated: 'databaseRecreated',
      ConnectivityListenerFailed: 'connectivityListenerFailed',
      ScreenProtectionListenerFailed: 'screenProtectionListenerFailed',
      ScreenProtectionNativeFailed: 'screenProtectionNativeFailed',
      BiometricMisconfigured: 'biometricMisconfigured',
      UnreadableVotesDiscarded: 'unreadableVotesDiscarded',
      MonitoringNotStarted: 'monitoringNotStarted',
      ResetNoticeUnreadable: 'resetNoticeUnreadable',
      ResetNoticeNotCleared: 'resetNoticeNotCleared',
    });
    expect(LOG_ATTRIBUTE).toEqual({
      UserId: 'userId',
      MeetingId: 'meetingId',
      ResolutionId: 'resolutionId',
      DocumentId: 'documentId',
      Period: 'period',
      Resource: 'resource',
      Freshness: 'freshness',
      Confidentiality: 'confidentiality',
      CaptureKind: 'captureKind',
      ErrorCode: 'errorCode',
      Attempts: 'attempts',
      Synced: 'synced',
      Rejected: 'rejected',
      Remaining: 'remaining',
      Discarded: 'discarded',
      IssuePaths: 'issuePaths',
      Reason: 'reason',
    });
  });
});
