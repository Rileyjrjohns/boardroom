import { CORE_TEST_IDS } from '@core/presentation/testIds';
import { AUTH_TEST_IDS } from '@features/auth/presentation/testIds';
import { DOCUMENTS_TEST_IDS } from '@features/documents/presentation/testIds';
import { MEETINGS_TEST_IDS } from '@features/meetings/presentation/testIds';
import { VOTES_TEST_IDS } from '@features/votes/presentation/testIds';

/**
 * The test IDs of the shell of the app: what is shown while the app starts, and when it fails.
 */
export const SHELL_TEST_IDS = {
  startupLoading: 'startup-loading',
  startupFailure: 'startup-failure',
  errorBoundary: 'error-boundary',
} as const;

/**
 * Every test ID of the app, put together: the core's, the shell's and each feature's, which each
 * declares its own (a raw `testID` literal is a lint error). The composition is the one place that
 * sees them all, so it is where the registry that the specification is compared with is made.
 * A test checks that no two of them share a name or a value.
 */
export const TEST_IDS = {
  ...CORE_TEST_IDS,
  ...SHELL_TEST_IDS,
  ...AUTH_TEST_IDS,
  ...MEETINGS_TEST_IDS,
  ...DOCUMENTS_TEST_IDS,
  ...VOTES_TEST_IDS,
} as const;

// The ones that depend on an item are built by functions, declared by the feature that owns them.
export { demoAccountTestId } from '@core/presentation/testIds';
export {
  agendaItemTestId,
  documentTestId,
  meetingRowTestId,
  participantTestId,
  periodOptionTestId,
  resolutionTestId,
  MEETING_ROW_TEST_ID_PREFIX,
} from '@features/meetings/presentation/testIds';
export {
  acknowledgeTestId,
  openVoteMeetingTestId,
  pendingVoteTestId,
  rejectedVoteTestId,
  voteChoiceTestId,
  voteChoicesTestId,
  voteNoticeTestId,
  voteOutcomeTestId,
} from '@features/votes/presentation/testIds';
