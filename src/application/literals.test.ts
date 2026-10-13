import { BIOMETRIC_REASON } from './ports/BiometricGate';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from './ports/Monitoring';
import { SCREEN_CAPTURE_KIND } from './ports/ScreenProtection';
import { ENQUEUE_OUTCOME } from './ports/VoteOutbox';
import { FRESHNESS } from './shared/Loaded';
import { CACHE_RESOURCE } from './shared/loadWithCacheFallback';
import { SESSION_RESTORE } from './use-cases/auth/RestoreSession';
import { CAST_VOTE_STATUS } from './use-cases/votes/CastVote';
import { SYNC_OUTCOME } from './use-cases/votes/SyncPendingVotes';

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
    expect(ENQUEUE_OUTCOME).toEqual({ Enqueued: 'enqueued', AlreadyQueued: 'alreadyQueued' });
  });

  it('are those of the reasons and kinds that cross the ports', () => {
    expect(BIOMETRIC_REASON).toEqual({ UnlockApp: 'unlockApp', ConfirmVote: 'confirmVote' });
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
    });
  });
});
