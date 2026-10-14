import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { router } from 'expo-router';

import { createFakes } from '@application/testing/createFakes';
import { withVoteRecorded } from '@domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { err } from '@domain/shared/Result';
import {
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aResolution,
  aResolutionId,
  anAgendaItem,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { createI18n } from '../i18n/createI18n';
import {
  TEST_IDS,
  meetingRowTestId,
  pendingVoteTestId,
  rejectedVoteTestId,
  resolutionTestId,
  voteChoiceTestId,
  voteNoticeTestId,
  voteOutcomeTestId,
} from '../testIds';
import { epochOf } from '../testing/accessEpoch';
import { driveAppState } from '../testing/appState';
import { renderApp } from '../testing/renderApp';

// The whole offline scenario of the demo, in the real navigator, with the switch of the demo
// driving the connection exactly as it does in the running app: go offline, open a meeting already
// seen, vote, see it queued, go online, see it sent. The detail is checked at every stage.

const RESOLUTION = aResolutionId('budget');
const MEETING = aMeeting({
  summary: aMeetingSummary({ id: aMeetingId('meeting-1'), title: 'Board of directors' }),
  agenda: [
    anAgendaItem({ resolution: aResolution({ id: RESOLUTION, title: 'Approve the budget' }) }),
  ],
});
const { t } = createI18n('en');

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function press(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testId));
  });
  await settle();
}

function startOffline() {
  const fakes = createFakes();
  fakes.meetings.addMeeting(MEETING);
  fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [MEETING]);
  // The server records a vote on the meeting it serves, as the real one does.
  fakes.votes.onReceive = (vote) => {
    if (fakes.network.online) fakes.meetings.addMeeting(withVoteRecorded(MEETING, vote));
  };
  fakes.auth.session = undefined;
  fakes.appLock.lock();
  driveAppState();
  const app = renderApp({ fakes, demo: true });
  return { ...app, fakes };
}

async function signInAndOpenMeeting(): Promise<void> {
  fireEvent.changeText(await screen.findByTestId(TEST_IDS.signInEmail), 'alice@example.com');
  fireEvent.changeText(screen.getByTestId(TEST_IDS.signInPassword), 'secret');
  await press(TEST_IDS.signInSubmit);
  await press(meetingRowTestId(MEETING.id));
  await screen.findByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For));
}

describe('the offline scenario', () => {
  it('goes offline, votes on a meeting already seen, queues the vote, and sends it when the connection returns', async () => {
    const { fakes } = startOffline();
    await signInAndOpenMeeting();

    // 1. The meeting has been seen: it is saved on the device.
    expect(fakes.meetingCache.isEmpty()).toBe(false);
    expect(screen.queryByTestId(TEST_IDS.statusBanner)).toBeNull();

    // 2. The connection is cut with the switch of the demo: the banner says so.
    await press(TEST_IDS.demoOfflineSwitch);
    expect(screen.getByTestId(TEST_IDS.offlineBanner)).toHaveTextContent(t('banner.offline'));
    expect(fakes.network.online).toBe(false);

    // 3. The user votes: it is saved, and the detail says it is waiting, with the choice.
    await press(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.Against));
    expect(screen.getByTestId(TEST_IDS.voteDialogOffline)).toBeTruthy();
    await press(TEST_IDS.voteConfirm);

    const resolution = screen.getByTestId(resolutionTestId(RESOLUTION));
    expect(screen.getByTestId(voteOutcomeTestId(RESOLUTION))).toHaveTextContent(t('voting.queued'));
    expect(
      within(resolution).getByText(
        t('meeting.resolutionYourVoteQueued', { choice: t('voteChoice.against') }),
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For))).toBeNull();
    expect(fakes.votes.recordedVotes()).toEqual([]);
    expect(fakes.outbox.snapshot()).toHaveLength(1);

    // 4. The vote is in the list of the pending votes, and nowhere else.
    await press(TEST_IDS.demoOfflineSwitch);
    expect(fakes.network.online).toBe(true);
    await settle();

    // 5. The connection is back: the vote is sent by itself, and the detail shows it recorded.
    expect(fakes.votes.recordedVotes().map((vote) => vote.choice)).toEqual([VOTE_CHOICE.Against]);
    expect(fakes.outbox.snapshot()).toEqual([]);
    expect(
      within(await screen.findByTestId(TEST_IDS.syncSummary)).getByText(
        t('banner.sent', { count: 1, formattedCount: '1' }),
      ),
    ).toBeTruthy();
    expect(
      await within(screen.getByTestId(resolutionTestId(RESOLUTION))).findByText(
        t('meeting.resolutionYourVote', { choice: t('voteChoice.against') }),
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        t('meeting.resolutionYourVoteQueued', { choice: t('voteChoice.against') }),
      ),
    ).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.offlineBanner)).toBeNull();
    // The vote is sent: "saved on this device" is no longer true, and is no longer said.
    expect(screen.queryByTestId(voteOutcomeTestId(RESOLUTION))).toBeNull();
    expect(screen.queryByText(t('voting.queued'))).toBeNull();
  });

  it('shows the queued vote in the pending votes, with a badge in the header, until it is sent', async () => {
    const { fakes } = startOffline();
    await signInAndOpenMeeting();
    await press(TEST_IDS.demoOfflineSwitch);
    await press(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);
    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);
    await settle();

    expect(within(screen.getByTestId(TEST_IDS.pendingVotesBadge)).getByText('1')).toBeTruthy();
    await press(TEST_IDS.pendingVotesButton);
    expect(await screen.findByTestId(pendingVoteTestId(RESOLUTION))).toBeTruthy();

    await press(TEST_IDS.demoOfflineSwitch);
    await settle();

    expect(screen.queryByTestId(pendingVoteTestId(RESOLUTION))).toBeNull();
    expect(await screen.findByTestId(TEST_IDS.pendingVotesEmpty)).toBeTruthy();
    expect(fakes.votes.recordedVotes()).toHaveLength(1);
  });

  it('tells the user a queued vote was rejected when the server refuses it, and lets them acknowledge it', async () => {
    const { fakes } = startOffline();
    await signInAndOpenMeeting();
    await press(TEST_IDS.demoOfflineSwitch);
    await press(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);
    // While the user was offline the voting closed.
    fakes.meetings.addMeeting(
      aMeeting({
        summary: aMeetingSummary({ id: MEETING.id, title: MEETING.title }),
        agenda: [
          anAgendaItem({
            resolution: aResolution({
              id: RESOLUTION,
              title: 'Approve the budget',
              status: RESOLUTION_STATUS.Closed,
            }),
          }),
        ],
      }),
    );
    fakes.votes.answerNext(err({ code: VOTING_ERROR_CODE.ResolutionClosed }));

    await press(TEST_IDS.demoOfflineSwitch);
    await settle();

    expect(
      within(await screen.findByTestId(TEST_IDS.syncSummary)).getByText(
        t('banner.rejected', { count: 1, formattedCount: '1' }),
      ),
    ).toBeTruthy();
    expect(fakes.outbox.snapshot()).toHaveLength(1);
    expect(fakes.outbox.snapshot()[0]).toMatchObject({ status: 'rejected' });
    // The vote was refused: it is no longer saved to be sent, and the detail no longer says so.
    expect(screen.queryByText(t('voting.queued'))).toBeNull();
    expect(screen.queryByTestId(voteOutcomeTestId(RESOLUTION))).toBeNull();
    expect(screen.getByTestId(voteNoticeTestId(RESOLUTION))).toHaveTextContent(
      t('voting.rejected', { reason: t('voting.reason.resolutionClosed') }),
    );

    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);
    await press(TEST_IDS.pendingVotesButton);
    const row = await screen.findByTestId(rejectedVoteTestId(RESOLUTION));
    expect(within(row).getByText(t('voting.reason.resolutionClosed'))).toBeTruthy();
  });

  it('announces a change of the connection once, from the screen the user is looking at, not from the list under it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    startOffline();
    await signInAndOpenMeeting();
    announce.mockClear();

    await press(TEST_IDS.demoOfflineSwitch);

    // The list is still mounted under the detail, with a banner of its own saying the same thing.
    expect(announce.mock.calls.filter(([message]) => message === t('banner.offline'))).toHaveLength(
      1,
    );

    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);
    await settle();

    // Back on the list: what it shows was already said, and is not said again.
    expect(announce.mock.calls.filter(([message]) => message === t('banner.offline'))).toHaveLength(
      1,
    );
  });

  it('lets the demo bring the connection back from the sign-in screen, after a sign-out while offline', async () => {
    const { fakes } = startOffline();
    await signInAndOpenMeeting();
    await press(TEST_IDS.demoOfflineSwitch);
    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);

    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);

    // Signed out and offline: the sign-in screen says so, and has the switch to undo it.
    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.offlineBanner)).toHaveTextContent(t('banner.offline'));
    expect(fakes.network.online).toBe(false);

    await press(TEST_IDS.demoOfflineSwitch);

    expect(fakes.network.online).toBe(true);
    expect(screen.queryByTestId(TEST_IDS.offlineBanner)).toBeNull();
  });

  it('lets the demo bring the connection back from the lock screen as well', async () => {
    const { fakes, uiStore } = startOffline();
    await signInAndOpenMeeting();
    await press(TEST_IDS.demoOfflineSwitch);
    act(() => {
      uiStore.getState().locked(epochOf(uiStore));
    });
    fakes.appLock.lock();
    await settle();

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.offlineBanner)).toBeTruthy();
    await press(TEST_IDS.demoOfflineSwitch);

    expect(fakes.network.online).toBe(true);
    expect(screen.queryByTestId(TEST_IDS.offlineBanner)).toBeNull();
  });

  it('does not send a waiting vote while the app is locked, and sends it once the user unlocks', async () => {
    const { fakes, uiStore } = startOffline();
    await signInAndOpenMeeting();
    await press(TEST_IDS.demoOfflineSwitch);
    await press(voteChoiceTestId(RESOLUTION, VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);
    act(() => {
      uiStore.getState().locked(epochOf(uiStore));
    });
    fakes.appLock.lock();
    await settle();

    await act(async () => {
      fakes.network.goOnline();
      fakes.connectivity.emit('online');
    });
    await settle();

    expect(fakes.votes.recordedVotes()).toEqual([]);
    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();

    await press(TEST_IDS.lockUnlock);
    await settle();

    expect(fakes.votes.recordedVotes()).toHaveLength(1);
  });
});
