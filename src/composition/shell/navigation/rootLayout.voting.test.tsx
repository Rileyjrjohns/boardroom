import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { createI18n } from '@core/presentation/i18n/createI18n';
import { setDeviceLanguages } from '@core/presentation/i18n/testing/setDeviceLanguages';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { aMeetingId, aResolutionId } from '@testing/domain/builders';
import { AUTH_TEST_IDS } from '@features/auth/presentation/testIds';
import {
  meetingRowTestId,
  resolutionTestId,
  MEETINGS_TEST_IDS,
} from '@features/meetings/presentation/testIds';
import {
  pendingVoteTestId,
  voteChoiceTestId,
  voteNoticeTestId,
  voteOutcomeTestId,
  VOTES_TEST_IDS,
} from '@features/votes/presentation/testIds';
import { demoAccountTestId, CORE_TEST_IDS } from '@core/presentation/testIds';

// The vote, from the sign-in screen to the recorded outcome, through the real root layout, the real
// route files and the real composition root in its mock configuration: the flow that the end-to-end
// tests of `.maestro/` run on a device, with the same ids. The simulated server is deterministic,
// and `meeting-002` is an upcoming meeting where the demo user is a voting member of the one
// resolution that is still theirs to vote on. Only the language of the device is set by the tests.

const initial = process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
const ALICE = 'alice.martin@boardroom.example';
const MEETING = aMeetingId('meeting-002');
const RESOLUTION = aResolutionId('meeting-002-resolution-subject');
const { t } = createI18n('en');
/** A vote crosses the simulated server three times (cast, meeting, outbox), 400 ms each. */
const SLOW: { timeout: number } = { timeout: 10_000 };

beforeEach(() => {
  setDeviceLanguages('en');
  // The real composition root writes its events to the console, at the level of information.
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
});

/** Signs in with the first demo account and opens the meeting, once its choices are shown. */
async function signInAndOpenTheMeeting(): Promise<void> {
  fireEvent.press(await screen.findByTestId(demoAccountTestId(ALICE)));
  fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signInSubmit));
  fireEvent.press(await screen.findByTestId(meetingRowTestId(MEETING)));
  await screen.findByTestId(MEETINGS_TEST_IDS.meetingDetail);
  await screen.findByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For));
}

async function goBackToTheList(): Promise<void> {
  act(() => {
    router.back();
  });
  await screen.findByTestId(MEETINGS_TEST_IDS.meetingsList);
}

describe('voting, with the real composition root', () => {
  it('lists the meetings, opens one, votes after the confirmation, and sees the vote recorded', async () => {
    renderRouter();
    await signInAndOpenTheMeeting();

    fireEvent.press(screen.getByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For)));

    // The confirmation states the choice and that the vote is final, and nothing of the offline.
    const dialog = await screen.findByTestId(VOTES_TEST_IDS.voteDialog);
    expect(within(dialog).getByTestId(VOTES_TEST_IDS.voteDialogChoice)).toHaveTextContent(
      t('voteChoice.for'),
      { exact: false },
    );
    expect(within(dialog).getByTestId(VOTES_TEST_IDS.voteDialogFinal)).toBeTruthy();
    expect(within(dialog).queryByTestId(VOTES_TEST_IDS.voteDialogOffline)).toBeNull();

    fireEvent.press(within(dialog).getByTestId(VOTES_TEST_IDS.voteConfirm));

    // Recorded: the outcome is told once, the choices are gone, and the resolution says the user has
    // voted, in the words of the one the server recorded.
    expect(await screen.findByTestId(voteOutcomeTestId(RESOLUTION), {}, SLOW)).toHaveTextContent(
      t('voting.submitted'),
    );
    await waitFor(() => {
      expect(screen.queryByTestId(VOTES_TEST_IDS.voteDialog)).toBeNull();
    });
    expect(await screen.findByTestId(voteNoticeTestId(RESOLUTION), {}, SLOW)).toHaveTextContent(
      t('voting.reason.alreadyVotedRecorded'),
    );
    expect(
      within(screen.getByTestId(resolutionTestId(RESOLUTION))).getByText(
        t('meeting.resolutionYourVote', { choice: t('voteChoice.for') }),
      ),
    ).toBeTruthy();
    for (const choice of Object.values(VOTE_CHOICE)) {
      expect(screen.queryByTestId(voteChoiceTestId(RESOLUTION, choice))).toBeNull();
    }
    expect(screen.queryByTestId(CORE_TEST_IDS.offlineBanner)).toBeNull();
  });

  it('keeps the vote of the user: it is still recorded when the meeting is opened again', async () => {
    renderRouter();
    await signInAndOpenTheMeeting();
    fireEvent.press(screen.getByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.Against)));
    fireEvent.press(await screen.findByTestId(VOTES_TEST_IDS.voteConfirm));
    await screen.findByTestId(voteNoticeTestId(RESOLUTION), {}, SLOW);
    await goBackToTheList();

    fireEvent.press(screen.getByTestId(meetingRowTestId(MEETING)));

    expect(await screen.findByTestId(voteNoticeTestId(RESOLUTION), {}, SLOW)).toHaveTextContent(
      t('voting.reason.alreadyVotedRecorded'),
    );
    expect(
      within(screen.getByTestId(resolutionTestId(RESOLUTION))).getByText(
        t('meeting.resolutionYourVote', { choice: t('voteChoice.against') }),
      ),
    ).toBeTruthy();
  });

  it('shows a vote cast offline in the pending votes, with a badge, until the connection sends it', async () => {
    renderRouter();
    await signInAndOpenTheMeeting();
    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));
    await screen.findByTestId(CORE_TEST_IDS.offlineBanner);

    fireEvent.press(screen.getByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.Abstain)));
    expect(await screen.findByTestId(VOTES_TEST_IDS.voteDialogOffline)).toBeTruthy();
    fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.voteConfirm));
    expect(await screen.findByTestId(voteOutcomeTestId(RESOLUTION))).toHaveTextContent(
      t('voting.queued'),
    );
    // Waiting to be sent: the server has recorded nothing, so the resolution does not say so.
    expect(screen.queryByTestId(voteNoticeTestId(RESOLUTION))).toBeNull();

    await goBackToTheList();
    expect(
      within(await screen.findByTestId(VOTES_TEST_IDS.pendingVotesBadge)).getByText('1'),
    ).toBeTruthy();
    fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.pendingVotesButton));
    const row = await screen.findByTestId(pendingVoteTestId(RESOLUTION));
    expect(within(row).getByText(t('voteChoice.abstain'), { exact: false })).toBeTruthy();
    expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesEmpty)).toBeNull();

    // The connection comes back, from the screen the user is on: the vote is sent and the list empties.
    fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));
    expect(await screen.findByTestId(VOTES_TEST_IDS.pendingVotesEmpty, {}, SLOW)).toBeTruthy();
    expect(screen.queryByTestId(pendingVoteTestId(RESOLUTION))).toBeNull();
    expect(screen.queryByTestId(CORE_TEST_IDS.offlineBanner)).toBeNull();
    expect(
      within(await screen.findByTestId(VOTES_TEST_IDS.syncSummary, {}, SLOW)).getByText(
        t('banner.sent', { count: 1, formattedCount: '1' }),
      ),
    ).toBeTruthy();
  });
});
