import type { MeetingId, ResolutionId } from '@domain/value-objects/ids';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';

/**
 * The test IDs of the screens, referenced by the components and by their tests: a raw `testID`
 * literal is a lint error. The ones that depend on an item are built by the functions below.
 */
export const TEST_IDS = {
  meetingsList: 'meetings-list',
  meetingsLoading: 'meetings-loading',
  meetingsEmpty: 'meetings-empty',
  meetingsError: 'meetings-error',
  meetingsEnd: 'meetings-end',
  meetingsLoadingMore: 'meetings-loading-more',
  meetingsLoadMoreError: 'meetings-load-more-error',
  refreshError: 'refresh-error',
  staleBanner: 'stale-banner',
  retryButton: 'retry-button',
  meetingDetail: 'meeting-detail',
  meetingLoading: 'meeting-loading',
  meetingError: 'meeting-error',
  meetingNotFound: 'meeting-not-found',
  meetingTitle: 'meeting-title',
  agendaSection: 'agenda-section',
  documentsSection: 'documents-section',
  participantsSection: 'participants-section',
  startupLoading: 'startup-loading',
  startupFailure: 'startup-failure',
  restoreError: 'restore-error',
  restoreForget: 'restore-forget',
  restoreForgetError: 'restore-forget-error',
  sessionNotice: 'session-notice',
  errorBoundary: 'error-boundary',
  signInScreen: 'sign-in-screen',
  signInEmail: 'sign-in-email',
  signInEmailError: 'sign-in-email-error',
  signInPassword: 'sign-in-password',
  signInPasswordError: 'sign-in-password-error',
  signInError: 'sign-in-error',
  signInSubmit: 'sign-in-submit',
  demoPanel: 'demo-panel',
  demoAccounts: 'demo-accounts',
  demoOfflineSwitch: 'demo-offline-switch',
  lockScreen: 'lock-screen',
  lockUnlock: 'lock-unlock',
  lockError: 'lock-error',
  lockSignOut: 'lock-sign-out',
  privacyCover: 'privacy-cover',
  appContent: 'app-content',
  signOutButton: 'sign-out-button',
  signOutDialog: 'sign-out-dialog',
  signOutPending: 'sign-out-pending',
  signOutError: 'sign-out-error',
  signOutConfirm: 'sign-out-confirm',
  signOutCancel: 'sign-out-cancel',
  pendingVotesButton: 'pending-votes-button',
  pendingVotesBadge: 'pending-votes-badge',
  pendingVotesScreen: 'pending-votes-screen',
  pendingVotesLoading: 'pending-votes-loading',
  pendingVotesError: 'pending-votes-error',
  pendingVotesEmpty: 'pending-votes-empty',
  pendingVotesWaiting: 'pending-votes-waiting',
  pendingVotesRejected: 'pending-votes-rejected',
  statusBanner: 'status-banner',
  offlineBanner: 'offline-banner',
  unreadableVotes: 'unreadable-votes',
  unreadableVotesDiscard: 'unreadable-votes-discard',
  unreadableVotesDialog: 'unreadable-votes-dialog',
  unreadableVotesConfirm: 'unreadable-votes-confirm',
  unreadableVotesCancel: 'unreadable-votes-cancel',
  unreadableVotesError: 'unreadable-votes-error',
  syncSummary: 'sync-summary',
  syncSummaryDismiss: 'sync-summary-dismiss',
  localDataResetNotice: 'local-data-reset-notice',
  localDataResetDismiss: 'local-data-reset-dismiss',
  votingLoading: 'voting-loading',
  votingError: 'voting-error',
  voteDialog: 'vote-dialog',
  voteDialogChoice: 'vote-dialog-choice',
  voteDialogFinal: 'vote-dialog-final',
  voteDialogOffline: 'vote-dialog-offline',
  voteDialogError: 'vote-dialog-error',
  voteConfirm: 'vote-confirm',
  voteCancel: 'vote-cancel',
  voteClose: 'vote-close',
  documentScreen: 'document-screen',
  documentNotFound: 'document-not-found',
  documentLoading: 'document-loading',
  documentError: 'document-error',
  documentTitle: 'document-title',
  documentProtectedBadge: 'document-protected-badge',
  documentPdf: 'document-pdf',
  documentPdfLoading: 'document-pdf-loading',
  documentPdfError: 'document-pdf-error',
  documentPageIndicator: 'document-page-indicator',
  documentWatermark: 'document-watermark',
  documentSecureContent: 'document-secure-content',
  documentWatermarkTile: 'document-watermark-tile',
  documentCaptureNotice: 'document-capture-notice',
  documentCaptureDismiss: 'document-capture-dismiss',
} as const;

export const MEETING_ROW_TEST_ID_PREFIX = 'meeting-row-';
const PERIOD_OPTION_PREFIX = 'period-option-';
const AGENDA_ITEM_PREFIX = 'agenda-item-';
const RESOLUTION_PREFIX = 'resolution-';
const DOCUMENT_PREFIX = 'document-';
const PARTICIPANT_PREFIX = 'participant-';
const VOTE_CHOICE_PREFIX = 'vote-choice-';
const VOTE_CHOICES_PREFIX = 'vote-choices-';
const VOTE_NOTICE_PREFIX = 'vote-notice-';
const VOTE_OUTCOME_PREFIX = 'vote-outcome-';
const ACKNOWLEDGE_PREFIX = 'acknowledge-';
const PENDING_VOTE_PREFIX = 'pending-vote-';
const REJECTED_VOTE_PREFIX = 'rejected-vote-';
const OPEN_VOTE_MEETING_PREFIX = 'open-vote-meeting-';
const DEMO_ACCOUNT_PREFIX = 'demo-account-';

export const meetingRowTestId = (id: MeetingId): string => `${MEETING_ROW_TEST_ID_PREFIX}${id}`;
export const periodOptionTestId = (period: MeetingPeriod): string =>
  `${PERIOD_OPTION_PREFIX}${period}`;
export const agendaItemTestId = (id: string): string => `${AGENDA_ITEM_PREFIX}${id}`;
export const resolutionTestId = (id: string): string => `${RESOLUTION_PREFIX}${id}`;
export const documentTestId = (id: string): string => `${DOCUMENT_PREFIX}${id}`;
export const participantTestId = (userId: string): string => `${PARTICIPANT_PREFIX}${userId}`;
/** The list that holds the three choice buttons of a resolution. */
export const voteChoicesTestId = (resolutionId: ResolutionId): string =>
  `${VOTE_CHOICES_PREFIX}${resolutionId}`;
/** The button of one choice (for, against, abstain) under a resolution. */
export const voteChoiceTestId = (resolutionId: ResolutionId, choice: VoteChoice): string =>
  `${VOTE_CHOICE_PREFIX}${resolutionId}-${choice}`;
/** The line that tells where the vote of the user stands on a resolution, or why they cannot vote. */
export const voteNoticeTestId = (resolutionId: ResolutionId): string =>
  `${VOTE_NOTICE_PREFIX}${resolutionId}`;
/** What happened to the vote the user has just cast on a resolution. */
export const voteOutcomeTestId = (resolutionId: ResolutionId): string =>
  `${VOTE_OUTCOME_PREFIX}${resolutionId}`;
/** The button that acknowledges the rejected vote on a resolution. */
export const acknowledgeTestId = (resolutionId: ResolutionId): string =>
  `${ACKNOWLEDGE_PREFIX}${resolutionId}`;
export const pendingVoteTestId = (resolutionId: ResolutionId): string =>
  `${PENDING_VOTE_PREFIX}${resolutionId}`;
export const rejectedVoteTestId = (resolutionId: ResolutionId): string =>
  `${REJECTED_VOTE_PREFIX}${resolutionId}`;
/** The button of a pending or rejected vote that opens its meeting. */
export const openVoteMeetingTestId = (resolutionId: ResolutionId): string =>
  `${OPEN_VOTE_MEETING_PREFIX}${resolutionId}`;
/** The button that fills in the credentials of a demo account, named after its email address. */
export const demoAccountTestId = (email: string): string => `${DEMO_ACCOUNT_PREFIX}${email}`;
