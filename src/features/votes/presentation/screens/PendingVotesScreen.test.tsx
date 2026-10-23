import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { voteUndeliverable } from '@features/votes/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { translateCount } from '@core/presentation/i18n/translateCount';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { createFakes } from '@testing/application/createFakes';
import {
  aMeetingId,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aUserId,
  aVote,
  at,
} from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { PendingVotesScreen } from './PendingVotesScreen';
import {
  acknowledgeTestId,
  openVoteMeetingTestId,
  pendingVoteTestId,
  rejectedVoteTestId,
  VOTES_TEST_IDS,
} from '../testIds';
import { CORE_TEST_IDS } from '@core/presentation/testIds';

const R1 = aResolutionId('r1');
const R2 = aResolutionId('r2');
const R3 = aResolutionId('r3');
const MEETING_A = aMeetingId('meeting-a');
const MEETING_B = aMeetingId('meeting-b');

const FIRST = aPendingVote(
  aVote({ resolutionId: R1, meetingId: MEETING_A, choice: VOTE_CHOICE.For, castAt: at(-5000) }),
);
const SECOND = aPendingVote(
  aVote({ resolutionId: R2, meetingId: MEETING_B, choice: VOTE_CHOICE.Abstain, castAt: at(-4000) }),
);
const REJECTED = aRejectedVote(
  aVote({ resolutionId: R3, meetingId: MEETING_A, choice: VOTE_CHOICE.Against, castAt: at(-3000) }),
  { code: VOTING_ERROR_CODE.ResolutionClosed },
);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderPending(options: RenderScreenOptions & { onOpenMeeting?: jest.Mock } = {}) {
  const { onOpenMeeting = jest.fn(), ...screenOptions } = options;
  const rendered = renderScreen(
    <PendingVotesScreen onOpenMeeting={onOpenMeeting} />,
    screenOptions,
  );
  return { ...rendered, onOpenMeeting };
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

describe('PendingVotesScreen', () => {
  it('shows a loading state, then the votes', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(FIRST);
    renderPending({ fakes });
    expect(screen.getByTestId(VOTES_TEST_IDS.pendingVotesLoading)).toBeTruthy();

    await screen.findByTestId(VOTES_TEST_IDS.pendingVotesScreen);

    expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesLoading)).toBeNull();
  });

  it('says no vote is waiting when the outbox is empty', async () => {
    const { t } = renderPending();

    const empty = await screen.findByTestId(VOTES_TEST_IDS.pendingVotesEmpty);

    expect(within(empty).getByText(t('pendingVotes.empty'))).toBeTruthy();
    expect(screen.getByText(t('pendingVotes.explanation'))).toBeTruthy();
    expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesWaiting)).toBeNull();
    expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesRejected)).toBeNull();
  });

  describe('the votes that wait', () => {
    it('are listed oldest first, each with its choice and the date it was cast', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, SECOND);
      const { t, format } = renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesWaiting);

      const section = screen.getByTestId(VOTES_TEST_IDS.pendingVotesWaiting);
      const rows = within(section).getAllByTestId(/^pending-vote-/);

      expect(rows.map((row) => row.props.testID)).toEqual([
        pendingVoteTestId(R1),
        pendingVoteTestId(R2),
      ]);
      expect(within(section).getByRole('header', { name: t('pendingVotes.waiting') })).toBeTruthy();
      const first = screen.getByTestId(pendingVoteTestId(R1));
      expect(
        within(first).getByText(t('meeting.resolutionYourVote', { choice: t('voteChoice.for') })),
      ).toBeTruthy();
      expect(
        within(first).getByText(t('pendingVotes.castAt', { date: format.dateTime(at(-5000)) })),
      ).toBeTruthy();
      expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesRejected)).toBeNull();
    });

    it('lead to the meeting they were cast in', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, SECOND);
      const { onOpenMeeting, t } = renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesWaiting);

      fireEvent.press(screen.getByTestId(openVoteMeetingTestId(R2)));

      expect(onOpenMeeting).toHaveBeenCalledWith(MEETING_B);
      expect(
        within(screen.getByTestId(pendingVoteTestId(R1))).getByRole('button', {
          name: t('pendingVotes.openMeeting'),
        }),
      ).toBeTruthy();
    });

    it('are not shown to another user of the device', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(
        FIRST,
        aPendingVote(aVote({ resolutionId: R2, voterId: aUserId('user-2') })),
      );
      renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesWaiting);

      expect(screen.queryByTestId(pendingVoteTestId(R2))).toBeNull();
      expect(screen.getByTestId(pendingVoteTestId(R1))).toBeTruthy();
    });
  });

  describe('the votes that were rejected', () => {
    it('are listed apart, with the reason and the date, and offer to acknowledge them', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, REJECTED);
      const { t, format } = renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesRejected);

      const row = screen.getByTestId(rejectedVoteTestId(R3));

      expect(
        within(screen.getByTestId(VOTES_TEST_IDS.pendingVotesRejected)).getByRole('header', {
          name: t('pendingVotes.rejected'),
        }),
      ).toBeTruthy();
      expect(within(row).getByText(t('voting.reason.resolutionClosed'))).toBeTruthy();
      expect(
        within(row).getByText(t('meeting.resolutionYourVote', { choice: t('voteChoice.against') })),
      ).toBeTruthy();
      expect(
        within(row).getByText(t('pendingVotes.rejectedAt', { date: format.dateTime(at(60_000)) })),
      ).toBeTruthy();
      expect(within(row).getByRole('button', { name: t('voting.acknowledge') })).toBeTruthy();
      expect(screen.queryByTestId(rejectedVoteTestId(R1))).toBeNull();
    });

    it('tell a vote that was given up in words that count the attempts', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: R3 }), voteUndeliverable(5)));
      const { t, format } = renderPending({ fakes });

      const row = await screen.findByTestId(rejectedVoteTestId(R3));

      expect(
        within(row).getByText(
          translateCount(t, 'voting.reason.voteUndeliverable', 5, format.number),
        ),
      ).toBeTruthy();
    });

    it('are removed from the list when acknowledged, and the vote leaves the outbox', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, REJECTED);
      renderPending({ fakes });
      await screen.findByTestId(rejectedVoteTestId(R3));

      await act(async () => {
        fireEvent.press(screen.getByTestId(acknowledgeTestId(R3)));
      });
      await settle();

      await waitFor(() => {
        expect(screen.queryByTestId(rejectedVoteTestId(R3))).toBeNull();
      });
      expect(screen.queryByTestId(VOTES_TEST_IDS.pendingVotesRejected)).toBeNull();
      expect(fakes.outbox.snapshot().map((entry) => entry.vote.resolutionId)).toEqual([R1]);
      expect(screen.getByTestId(pendingVoteTestId(R1))).toBeTruthy();
    });

    it('stay, with the reason the acknowledgement failed, when the outbox cannot be written', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(REJECTED);
      fakes.outbox.removeFailure = storageWriteFailed();
      const { t } = renderPending({ fakes });
      await screen.findByTestId(rejectedVoteTestId(R3));

      await act(async () => {
        fireEvent.press(screen.getByTestId(acknowledgeTestId(R3)));
      });
      await settle();

      expect(screen.getByText(t('voting.failure.storageWriteFailed'))).toBeTruthy();
      expect(screen.getByTestId(rejectedVoteTestId(R3))).toBeTruthy();
    });

    it('are acknowledged once, however many times the button is pressed', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(REJECTED);
      const remove = jest.spyOn(fakes.outbox, 'remove');
      renderPending({ fakes });
      await screen.findByTestId(rejectedVoteTestId(R3));

      await act(async () => {
        fireEvent.press(screen.getByTestId(acknowledgeTestId(R3)));
        fireEvent.press(screen.getByTestId(acknowledgeTestId(R3)));
      });
      await settle();

      expect(remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('the saved votes that can no longer be read', () => {
    const USER = aUserId();

    it('says nothing when there are none', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesWaiting);

      expect(screen.queryByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeNull();
    });

    it.each([
      [1, 'en', '1 saved vote on this device can no longer be read. It will not be sent.'],
      [3, 'en', '3 saved votes on this device can no longer be read. They will not be sent.'],
      [1, 'fr', '1 vote enregistré sur cet appareil est devenu illisible. Il ne sera pas envoyé.'],
      [
        2,
        'fr',
        '2 votes enregistrés sur cet appareil sont devenus illisibles. Ils ne seront pas envoyés.',
      ],
    ] as const)(
      'says how many there are, and that they are not sent: %i in %s',
      async (count, language, text) => {
        const fakes = createFakes();
        for (let index = 0; index < count; index += 1)
          fakes.outbox.seedUnreadable(USER, `k${index}`);
        renderPending({ fakes, language });

        const notice = await screen.findByTestId(VOTES_TEST_IDS.unreadableVotes);

        expect(notice).toHaveTextContent(text, { exact: false });
      },
    );

    it('is shown next to the votes that can be read, which are listed as usual', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      fakes.outbox.seedUnreadable(USER, 'k1');
      renderPending({ fakes });

      expect(await screen.findByTestId(pendingVoteTestId(R1))).toBeTruthy();
      expect(screen.getByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeTruthy();
    });

    it('does not delete them by itself: the screen can be left and opened again, they are still there', async () => {
      const fakes = createFakes();
      fakes.outbox.seedUnreadable(USER, 'k1');
      const first = renderPending({ fakes });
      await screen.findByTestId(VOTES_TEST_IDS.unreadableVotes);
      first.unmount();

      renderPending({ fakes });

      expect(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeTruthy();
      expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
    });

    it('asks for a confirmation that repeats how many, before anything is deleted', async () => {
      const fakes = createFakes();
      fakes.outbox.seedUnreadable(USER, 'k1');
      fakes.outbox.seedUnreadable(USER, 'k2');
      const { t, format } = renderPending({ fakes });

      fireEvent.press(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotesDiscard));

      expect(screen.getByRole('header', { name: t('pendingVotes.discardTitle') })).toBeTruthy();
      expect(
        screen.getByText(translateCount(t, 'pendingVotes.discardMessage', 2, format.number)),
      ).toBeTruthy();
      expect(fakes.outbox.unreadableSnapshot()).toHaveLength(2);
    });

    it('deletes nothing when the user cancels', async () => {
      const fakes = createFakes();
      fakes.outbox.seedUnreadable(USER, 'k1');
      renderPending({ fakes });
      fireEvent.press(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotesDiscard));

      fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.unreadableVotesCancel));

      expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
      expect(screen.getByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeTruthy();
    });

    it('deletes them once the user confirms, and the notice goes', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      fakes.outbox.seedUnreadable(USER, 'k1');
      renderPending({ fakes });
      fireEvent.press(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotesDiscard));

      await act(async () => {
        fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.unreadableVotesConfirm));
      });
      await settle();

      await waitFor(() => {
        expect(screen.queryByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeNull();
      });
      expect(fakes.outbox.unreadableSnapshot()).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([FIRST]);
    });

    it('says why when they could not be deleted, keeps them, and lets the user try again', async () => {
      const fakes = createFakes();
      fakes.outbox.seedUnreadable(USER, 'k1');
      fakes.outbox.discardFailure = storageWriteFailed();
      const { t } = renderPending({ fakes });
      fireEvent.press(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotesDiscard));

      await act(async () => {
        fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.unreadableVotesConfirm));
      });
      await settle();

      expect(await screen.findByTestId(VOTES_TEST_IDS.unreadableVotesError)).toHaveTextContent(
        t('pendingVotes.discardFailed'),
      );
      expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);

      fakes.outbox.discardFailure = undefined;
      await act(async () => {
        fireEvent.press(screen.getByTestId(VOTES_TEST_IDS.unreadableVotesConfirm));
      });
      await settle();
      await waitFor(() => {
        expect(screen.queryByTestId(VOTES_TEST_IDS.unreadableVotes)).toBeNull();
      });
    });
  });

  describe('when the outbox cannot be read', () => {
    it('says why, with a way to try again, and shows the votes when it works', async () => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST);
      fakes.outbox.listFailure = storageReadFailed();
      const { t } = renderPending({ fakes });

      const error = await screen.findByTestId(VOTES_TEST_IDS.pendingVotesError, undefined, {
        timeout: 10_000,
      });
      expect(within(error).getByText(t('errors.storageReadFailed'))).toBeTruthy();

      fakes.outbox.listFailure = undefined;
      fireEvent.press(within(error).getByRole('button', { name: t('states.retry') }));

      expect(await screen.findByTestId(pendingVoteTestId(R1))).toBeTruthy();
    });

    it('sends the user to the lock screen, without a retry, when the app is locked', async () => {
      const fakes = createFakes();
      fakes.appLock.lock();
      const { accessStore } = renderPending({ fakes });

      await waitFor(() => {
        expect(accessStore.getState().access).toBe(ACCESS.Locked);
      });
    });
  });

  it('asks the outbox again when the user pulls to refresh', async () => {
    const fakes = createFakes();
    renderPending({ fakes });
    await screen.findByTestId(VOTES_TEST_IDS.pendingVotesEmpty);
    fakes.outbox.seed(FIRST);

    await act(async () => {
      screen.getByTestId(VOTES_TEST_IDS.pendingVotesScreen).props.refreshControl.props.onRefresh();
    });
    await settle();

    expect(await screen.findByTestId(pendingVoteTestId(R1))).toBeTruthy();
  });

  it('shows the banner area and, in the mock configuration, the demo switch', async () => {
    const { uiStore, t } = renderPending({ demo: true });
    await screen.findByTestId(VOTES_TEST_IDS.pendingVotesEmpty);

    act(() => {
      uiStore.getState().setConnectivity('offline');
    });

    expect(screen.getByTestId(CORE_TEST_IDS.offlineBanner)).toHaveTextContent(t('banner.offline'));
    expect(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch)).toBeTruthy();
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)('is written in %s, rejection included', async (language) => {
      const fakes = createFakes();
      fakes.outbox.seed(FIRST, REJECTED);
      const { t } = renderPending({ fakes, language });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesWaiting);

      expect(screen.getByRole('header', { name: t('pendingVotes.waiting') })).toBeTruthy();
      expect(screen.getByRole('header', { name: t('pendingVotes.rejected') })).toBeTruthy();
      expect(screen.getByText(t('voting.reason.resolutionClosed'))).toBeTruthy();
      expect(screen.getByText(t('pendingVotes.explanation'))).toBeTruthy();
    });

    it('shows the explanation of the page in French, with the text of the French resource', async () => {
      const { t } = renderPending({ language: 'fr' });
      await screen.findByTestId(VOTES_TEST_IDS.pendingVotesEmpty);

      expect(screen.getByText(t('pendingVotes.explanation'))).toBeTruthy();
    });
  });
});
