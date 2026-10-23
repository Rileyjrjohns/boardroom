import type { ResolutionId } from '@core/domain/value-objects/ids';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';

/** The test IDs of the screens of the votes. The ones that depend on an item are built by the functions below. */
export const VOTES_TEST_IDS = {
  pendingVotesButton: 'pending-votes-button',
  pendingVotesBadge: 'pending-votes-badge',
  pendingVotesScreen: 'pending-votes-screen',
  pendingVotesLoading: 'pending-votes-loading',
  pendingVotesError: 'pending-votes-error',
  pendingVotesEmpty: 'pending-votes-empty',
  pendingVotesWaiting: 'pending-votes-waiting',
  pendingVotesRejected: 'pending-votes-rejected',
  unreadableVotes: 'unreadable-votes',
  unreadableVotesDiscard: 'unreadable-votes-discard',
  unreadableVotesDialog: 'unreadable-votes-dialog',
  unreadableVotesConfirm: 'unreadable-votes-confirm',
  unreadableVotesCancel: 'unreadable-votes-cancel',
  unreadableVotesError: 'unreadable-votes-error',
  syncSummary: 'sync-summary',
  syncSummaryDismiss: 'sync-summary-dismiss',
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
} as const;

const VOTE_CHOICE_PREFIX = 'vote-choice-';
const VOTE_CHOICES_PREFIX = 'vote-choices-';
const VOTE_NOTICE_PREFIX = 'vote-notice-';
const VOTE_OUTCOME_PREFIX = 'vote-outcome-';
const ACKNOWLEDGE_PREFIX = 'acknowledge-';
const PENDING_VOTE_PREFIX = 'pending-vote-';
const REJECTED_VOTE_PREFIX = 'rejected-vote-';
const OPEN_VOTE_MEETING_PREFIX = 'open-vote-meeting-';

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
