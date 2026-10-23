import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Modal, Platform } from 'react-native';

import { ACCESS } from '@composition/shell/state/uiStore';
import {
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@core/domain/errors/BiometricError';
import type { BiometricError } from '@core/domain/errors/BiometricError';
import { unexpected } from '@core/domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { voteUndeliverable } from '@core/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import type { VotingError } from '@core/domain/errors/VotingError';
import { err } from '@core/domain/shared/Result';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { queryKeys } from '@core/presentation/query/queryKeys';
import {
  TEST_IDS,
  acknowledgeTestId,
  voteChoiceTestId,
  voteChoicesTestId,
  voteNoticeTestId,
  voteOutcomeTestId,
  resolutionTestId,
} from '@core/presentation/testIds';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { withVoteRecorded } from '@features/meetings/domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';
import { createFakes } from '@testing/application/createFakes';
import {
  aMeeting,
  aPendingVote,
  aRejectedVote,
  aResolution,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anAgendaItem,
  anAgendaItemId,
  at,
} from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { MeetingDetailScreen } from './MeetingDetailScreen';

const noDocument = (): void => undefined;

// Voting, on the detail of a meeting: who may vote and why the others may not, the confirmation
// that states the vote is final, every outcome of casting it, and what the screen shows at each
// stage. The use cases are the real ones, over the fakes of the ports.

const OPEN = aResolutionId('open');
const CLOSED = aResolutionId('closed');
const LAPSED = aResolutionId('lapsed');
const VOTED = aResolutionId('voted');

const MEETING = aMeeting({
  agenda: [
    anAgendaItem({
      id: anAgendaItemId('a1'),
      position: 1,
      resolution: aResolution({ id: OPEN, title: 'Approve the budget' }),
    }),
    anAgendaItem({
      id: anAgendaItemId('a2'),
      position: 2,
      resolution: aResolution({
        id: CLOSED,
        title: 'Elect the chair',
        status: RESOLUTION_STATUS.Closed,
      }),
    }),
    anAgendaItem({
      id: anAgendaItemId('a3'),
      position: 3,
      resolution: aResolution({ id: LAPSED, title: 'Appoint the auditor', closesAt: at(-1000) }),
    }),
    anAgendaItem({
      id: anAgendaItemId('a4'),
      position: 4,
      resolution: aResolution({
        id: VOTED,
        title: 'Approve the minutes',
        recordedVote: VOTE_CHOICE.Against,
      }),
    }),
  ],
});

/** Only the open resolution: for the scenarios of casting. */
const SINGLE = aMeeting({
  agenda: [anAgendaItem({ resolution: aResolution({ id: OPEN, title: 'Approve the budget' }) })],
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/**
 * The detail of `meeting`, for the signed-in user. The fake server records a vote on the meeting
 * it serves, as the real one does, so that asking for the meeting again shows the vote.
 */
function renderMeeting(meeting = SINGLE, options: RenderScreenOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  fakes.meetings.addMeeting(meeting);
  fakes.votes.onReceive = (vote) => {
    if (fakes.network.online && fakes.auth.session?.user.id === vote.voterId) {
      fakes.meetings.addMeeting(withVoteRecorded(meeting, vote));
    }
  };
  return renderScreen(<MeetingDetailScreen meetingId={meeting.id} onOpenDocument={noDocument} />, {
    ...options,
    fakes,
  });
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
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

const choiceId = (choice: (typeof VOTE_CHOICE)[keyof typeof VOTE_CHOICE], id = OPEN) =>
  voteChoiceTestId(id, choice);

/** Waits for the choices of the open resolution, which come once the user and the outbox are known. */
async function findChoices() {
  return screen.findByTestId(choiceId(VOTE_CHOICE.For));
}

async function chooseAndConfirm(choice: VoteChoice = VOTE_CHOICE.For): Promise<void> {
  await findChoices();
  await press(choiceId(choice));
  await press(TEST_IDS.voteConfirm);
}

describe('who may vote', () => {
  it('offers the three choices on a resolution that is open and that the user may vote on', async () => {
    const { t } = renderMeeting(MEETING);
    await findChoices();
    const open = screen.getByTestId(resolutionTestId(OPEN));

    for (const choice of Object.values(VOTE_CHOICE)) {
      expect(screen.getByTestId(choiceId(choice))).toBeTruthy();
    }
    expect(within(open).getByRole('header', { name: t('voting.choose') })).toBeTruthy();
    expect(within(open).getByRole('button', { name: t('voteChoice.for') })).toBeTruthy();
    expect(within(open).getByRole('button', { name: t('voteChoice.against') })).toBeTruthy();
    expect(within(open).getByRole('button', { name: t('voteChoice.abstain') })).toBeTruthy();
  });

  it('makes the choices at least as big as the touch target, with a hint that a confirmation follows', async () => {
    const { t } = renderMeeting(MEETING);
    await findChoices();

    const button = screen.getByTestId(choiceId(VOTE_CHOICE.Abstain));

    expect(button).toHaveStyle({ minHeight: 44 });
    expect(button.props.accessibilityHint).toBe(t('voting.choiceHint'));
  });

  it('stacks the choices instead of putting them side by side, so that no label is cut in two', async () => {
    renderMeeting(MEETING);
    await findChoices();

    const list = screen.getByTestId(voteChoicesTestId(OPEN));

    expect(list).not.toHaveStyle({ flexDirection: 'row' });
    for (const choice of Object.values(VOTE_CHOICE)) {
      expect(within(list).getByTestId(choiceId(choice))).toBeTruthy();
    }
  });

  it.each([
    ['closed', CLOSED, 'voting.reason.resolutionClosed'],
    ['over', LAPSED, 'voting.reason.votingWindowOver'],
    ['voted', VOTED, 'voting.reason.alreadyVotedRecorded'],
  ] as const)(
    'offers nothing, and says why, on a resolution that is %s',
    async (_state, id, key) => {
      const { t } = renderMeeting(MEETING);
      await findChoices();

      const notice = screen.getByTestId(voteNoticeTestId(id));

      expect(notice).toHaveTextContent(t(key));
      expect(
        within(screen.getByTestId(resolutionTestId(id))).queryAllByRole('button'),
      ).toHaveLength(0);
      for (const choice of Object.values(VOTE_CHOICE)) {
        expect(screen.queryByTestId(choiceId(choice, id))).toBeNull();
      }
    },
  );

  it.each([
    ['a guest', 'user-4', 'participantRole.guest'],
    ['the secretary', 'user-3', 'participantRole.secretary'],
  ] as const)(
    'says %s has no vote, naming the role, and offers no control',
    async (_who, id, role) => {
      const fakes = createFakes();
      fakes.auth.session = aSession({ user: aUser({ id: aUserId(id) }) });
      const { t } = renderMeeting(SINGLE, { fakes });

      const notice = await screen.findByTestId(voteNoticeTestId(OPEN));

      expect(notice).toHaveTextContent(t('voting.noVotingRightsAs', { role: t(role) }));
      expect(
        within(screen.getByTestId(resolutionTestId(OPEN))).queryAllByRole('button'),
      ).toHaveLength(0);
    },
  );

  it('says a user who is not in the meeting is not a participant', async () => {
    const fakes = createFakes();
    fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-9') }) });
    const { t } = renderMeeting(SINGLE, { fakes });

    expect(await screen.findByTestId(voteNoticeTestId(OPEN))).toHaveTextContent(
      t('voting.reason.notAParticipant'),
    );
  });

  it('judges the window of the vote at the instant the meeting was loaded', async () => {
    const lapsing = aMeeting({
      agenda: [anAgendaItem({ resolution: aResolution({ id: OPEN, closesAt: at(1000) }) })],
    });
    const fakes = createFakes();
    const { t } = renderMeeting(lapsing, { fakes });
    await findChoices();

    fakes.clock.advance(2000);
    await act(async () => {
      await screen.getByTestId(TEST_IDS.meetingDetail).props.refreshControl.props.onRefresh();
    });
    await settle();

    expect(await screen.findByTestId(voteNoticeTestId(OPEN))).toHaveTextContent(
      t('voting.reason.votingWindowOver'),
    );
  });

  it('shows no "you have not voted" line, and no control, while the outbox is not known', async () => {
    const fakes = createFakes();
    fakes.outbox.listFailure = storageReadFailed();
    const { t } = renderMeeting(SINGLE, { fakes });

    const error = await screen.findByTestId(TEST_IDS.votingError);

    expect(within(error).getByText(t('errors.storageReadFailed'))).toBeTruthy();
    expect(screen.queryByText(t('meeting.resolutionNoVote'))).toBeNull();
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
  });

  it('offers the controls when the outbox can be read again', async () => {
    const fakes = createFakes();
    fakes.outbox.listFailure = storageReadFailed();
    const { t } = renderMeeting(SINGLE, { fakes });
    await screen.findByTestId(TEST_IDS.votingError);
    fakes.outbox.listFailure = undefined;

    await press(TEST_IDS.retryButton);

    expect(await findChoices()).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.votingError)).toBeNull();
    expect(screen.queryByText(t('errors.storageReadFailed'))).toBeNull();
  });
});

describe('the confirmation step', () => {
  it('opens when a choice is touched, and states the choice, that the vote is final, and the biometrics', async () => {
    const { t } = renderMeeting();
    await findChoices();

    await press(choiceId(VOTE_CHOICE.Against));

    const dialog = screen.getByTestId(TEST_IDS.voteDialog);
    expect(within(dialog).getByRole('header', { name: t('voting.confirmTitle') })).toBeTruthy();
    expect(within(dialog).getByText('Approve the budget')).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.voteDialogChoice)).toHaveTextContent(
      t('voting.confirmChoice', { choice: t('voteChoice.against') }),
    );
    expect(screen.getByTestId(TEST_IDS.voteDialogFinal)).toHaveTextContent(
      t('voting.confirmFinal'),
    );
    expect(within(dialog).getByText(t('voting.confirmBiometric'))).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: t('voting.confirm') })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: t('common.cancel') })).toBeTruthy();
  });

  it('casts nothing, and prompts for nothing, until it is confirmed', async () => {
    const { fakes } = renderMeeting();
    await findChoices();

    await press(choiceId(VOTE_CHOICE.For));

    expect(fakes.biometricGate.prompts).toEqual([]);
    expect(fakes.votes.received).toEqual([]);
  });

  it('is dismissed by its cancel button, and nothing is cast', async () => {
    const { fakes } = renderMeeting();
    await findChoices();
    await press(choiceId(VOTE_CHOICE.For));

    await press(TEST_IDS.voteCancel);

    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
    expect(fakes.votes.received).toEqual([]);
    expect(screen.getByTestId(choiceId(VOTE_CHOICE.For))).toBeTruthy();
  });

  it('is dismissed by the back button of the system, and nothing is cast', async () => {
    const { fakes } = renderMeeting();
    await findChoices();
    await press(choiceId(VOTE_CHOICE.For));

    await act(async () => {
      screen.UNSAFE_getAllByType(Modal)[0]!.props.onRequestClose();
    });

    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
    expect(fakes.votes.received).toEqual([]);
  });

  it('is an accessible dialog: its title is a header, it is modal, and the screen reader goes to the title', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    renderMeeting();
    await findChoices();

    await press(choiceId(VOTE_CHOICE.For));

    const dialog = screen.getByTestId(TEST_IDS.voteDialog);
    expect(dialog.props.accessibilityViewIsModal).toBe(true);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('says the vote will be saved and sent later when the device is offline', async () => {
    const { uiStore, t } = renderMeeting();
    await findChoices();
    act(() => {
      uiStore.getState().setConnectivity('offline');
    });

    await press(choiceId(VOTE_CHOICE.For));

    expect(screen.getByTestId(TEST_IDS.voteDialogOffline)).toHaveTextContent(
      t('voting.confirmOffline'),
    );
  });

  it('does not mention the connection when the device is online', async () => {
    renderMeeting();
    await findChoices();

    await press(choiceId(VOTE_CHOICE.For));

    expect(screen.queryByTestId(TEST_IDS.voteDialogOffline)).toBeNull();
  });
});

describe('a vote that is submitted', () => {
  it('asks for the biometric proof, records the vote, closes the confirmation and says so', async () => {
    const { fakes, t } = renderMeeting();

    await chooseAndConfirm(VOTE_CHOICE.Against);

    expect(fakes.biometricGate.prompts).toEqual([BIOMETRIC_REASON.ConfirmVote]);
    expect(fakes.votes.recordedVotes().map((vote) => vote.choice)).toEqual([VOTE_CHOICE.Against]);
    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
    expect(screen.getByTestId(voteOutcomeTestId(OPEN))).toHaveTextContent(t('voting.submitted'));
  });

  it('shows the recorded vote at once, from the server, and takes the choices away', async () => {
    const { fakes, t } = renderMeeting();
    const requests = fakes.meetings.getCalls.length;

    await chooseAndConfirm(VOTE_CHOICE.For);

    expect(fakes.meetings.getCalls.length).toBeGreaterThan(requests);
    const resolution = screen.getByTestId(resolutionTestId(OPEN));
    expect(
      within(resolution).getByText(
        t('meeting.resolutionYourVote', { choice: t('voteChoice.for') }),
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
    expect(screen.getByTestId(voteNoticeTestId(OPEN))).toHaveTextContent(
      t('voting.reason.alreadyVotedRecorded'),
    );
  });

  it('announces the outcome to the screen reader on iOS', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const { t } = renderMeeting();
    announce.mockClear();

    await chooseAndConfirm();

    expect(announce).toHaveBeenCalledWith(t('voting.submitted'));
  });

  it('is cast once, however many times the confirm button is pressed', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    await press(choiceId(VOTE_CHOICE.For));
    let answer: () => void = () => undefined;
    fakes.biometricGate.onPrompt = () =>
      new Promise<void>((resolve) => {
        answer = resolve;
      });

    await act(async () => {
      fireEvent.press(screen.getByTestId(TEST_IDS.voteConfirm));
      fireEvent.press(screen.getByTestId(TEST_IDS.voteConfirm));
    });
    await settle();
    fireEvent.press(screen.getByTestId(TEST_IDS.voteConfirm));

    expect(fakes.biometricGate.prompts).toHaveLength(1);
    const confirm = screen.getByRole('button', { name: t('voting.confirming') });
    expect(confirm.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(screen.getByTestId(TEST_IDS.voteCancel).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    await act(async () => {
      answer();
    });
    await settle();
    expect(fakes.votes.received).toHaveLength(1);
  });

  it('cannot be dismissed while it is being cast', async () => {
    const { fakes } = renderMeeting();
    await findChoices();
    await press(choiceId(VOTE_CHOICE.For));
    let answer: () => void = () => undefined;
    fakes.biometricGate.onPrompt = () =>
      new Promise<void>((resolve) => {
        answer = resolve;
      });
    await press(TEST_IDS.voteConfirm);

    await act(async () => {
      screen.UNSAFE_getAllByType(Modal)[0]!.props.onRequestClose();
    });

    expect(screen.getByTestId(TEST_IDS.voteDialog)).toBeTruthy();
    await act(async () => {
      answer();
    });
    await settle();
  });
});

describe('a vote that is queued', () => {
  /** The device and the server lose the connection. */
  function goOffline(rendered: ReturnType<typeof renderMeeting>) {
    rendered.fakes.network.goOffline();
    act(() => {
      rendered.uiStore.getState().setConnectivity('offline');
    });
  }

  it('is saved for later when the server cannot be reached, and the screen says so', async () => {
    const rendered = renderMeeting();
    await findChoices();
    goOffline(rendered);

    await chooseAndConfirm(VOTE_CHOICE.Abstain);

    const { fakes, t } = rendered;
    expect(screen.getByTestId(voteOutcomeTestId(OPEN))).toHaveTextContent(t('voting.queued'));
    expect(fakes.outbox.snapshot().map((entry) => entry.vote.choice)).toEqual([
      VOTE_CHOICE.Abstain,
    ]);
    expect(fakes.votes.recordedVotes()).toEqual([]);
    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
  });

  it('shows "waiting to be sent" with the choice at once, and takes the choices away', async () => {
    const rendered = renderMeeting();
    await findChoices();
    goOffline(rendered);

    await chooseAndConfirm(VOTE_CHOICE.Against);

    const resolution = screen.getByTestId(resolutionTestId(OPEN));
    expect(
      within(resolution).getByText(
        rendered.t('meeting.resolutionYourVoteQueued', {
          choice: rendered.t('voteChoice.against'),
        }),
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
    expect(within(resolution).queryByText(rendered.t('meeting.resolutionNoVote'))).toBeNull();
  });

  it('puts the vote in the query for the pending votes, so that every screen that shows them is up to date', async () => {
    const rendered = renderMeeting();
    await findChoices();
    goOffline(rendered);

    await chooseAndConfirm();

    const outbox = rendered.queryClient.getQueryData<{ pending: { vote: { choice: string } }[] }>(
      queryKeys.votes.pending(),
    );
    expect(outbox?.pending.map((entry) => entry.vote.choice)).toEqual([VOTE_CHOICE.For]);
  });

  it('is saved too when the server fails in a way that says nothing about the vote', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    fakes.votes.answerNext(err(unexpected()));

    await press(choiceId(VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);

    expect(screen.getByTestId(voteOutcomeTestId(OPEN))).toHaveTextContent(t('voting.queued'));
    expect(fakes.outbox.snapshot()).toHaveLength(1);
  });

  it('keeps showing the waiting vote when the screen is opened again', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: OPEN, choice: VOTE_CHOICE.Abstain })));
    const { t } = renderMeeting(SINGLE, { fakes });

    expect(
      await screen.findByText(
        t('meeting.resolutionYourVoteQueued', { choice: t('voteChoice.abstain') }),
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
  });
});

describe('a vote that is refused', () => {
  const REFUSALS: readonly [string, VotingError, TranslationKey][] = [
    [
      'the resolution closed',
      { code: VOTING_ERROR_CODE.ResolutionClosed },
      'voting.reason.resolutionClosed',
    ],
    [
      'the window is over',
      { code: VOTING_ERROR_CODE.VotingWindowOver },
      'voting.reason.votingWindowOver',
    ],
    [
      'the user voted elsewhere',
      { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
      'voting.reason.alreadyVotedRecorded',
    ],
    [
      'the role carries no vote',
      { code: VOTING_ERROR_CODE.NoVotingRights },
      'voting.reason.noVotingRights',
    ],
    [
      'the user is not invited',
      { code: VOTING_ERROR_CODE.NotAParticipant },
      'voting.reason.notAParticipant',
    ],
    [
      'the resolution is gone',
      { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: OPEN },
      'voting.reason.resolutionNotFound',
    ],
  ];

  it.each(REFUSALS)(
    'tells it in the confirmation, with its own text, when %s',
    async (_why, refusal, key) => {
      const { fakes, t } = renderMeeting();
      await findChoices();
      fakes.votes.answerNext(err(refusal));

      await press(choiceId(VOTE_CHOICE.For));
      await press(TEST_IDS.voteConfirm);

      const message = screen.getByTestId(TEST_IDS.voteDialogError);
      expect(message).toHaveTextContent(t(key));
      expect(message.props.accessibilityRole).toBe('alert');
      expect(fakes.outbox.snapshot()).toEqual([]);
    },
  );

  it('offers only to close the confirmation, which a rule cannot be argued with, and asks the meeting again', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    fakes.votes.answerNext(err({ code: VOTING_ERROR_CODE.ResolutionClosed }));
    await press(choiceId(VOTE_CHOICE.For));
    const requests = fakes.meetings.getCalls.length;

    await press(TEST_IDS.voteConfirm);

    expect(screen.queryByTestId(TEST_IDS.voteConfirm)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.voteCancel)).toBeNull();
    expect(screen.getByRole('button', { name: t('common.close') })).toBeTruthy();
    expect(fakes.meetings.getCalls.length).toBeGreaterThan(requests);

    await press(TEST_IDS.voteClose);
    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
  });

  it('shows the state the server knows once the meeting is asked again', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    fakes.meetings.addMeeting(
      aMeeting({
        agenda: [
          anAgendaItem({
            resolution: aResolution({
              id: OPEN,
              title: 'Approve the budget',
              status: RESOLUTION_STATUS.Closed,
            }),
          }),
        ],
      }),
    );
    fakes.votes.answerNext(err({ code: VOTING_ERROR_CODE.ResolutionClosed }));

    await press(choiceId(VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);
    await press(TEST_IDS.voteClose);

    expect(await screen.findByTestId(voteNoticeTestId(OPEN))).toHaveTextContent(
      t('voting.reason.resolutionClosed'),
    );
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
  });
});

describe('the biometric confirmation', () => {
  const RETRYABLE: readonly [BiometricError, TranslationKey][] = [
    [biometricCancelled(), 'voteBiometric.biometricCancelled'],
    [biometricFailed(), 'voteBiometric.biometricFailed'],
    [biometricLockedOut(), 'voteBiometric.biometricLockedOut'],
  ];

  it.each(RETRYABLE)(
    'says what happened when the prompt ends with %p, casts nothing and lets the user try again',
    async (failure, key) => {
      const { fakes, t } = renderMeeting();
      await findChoices();
      fakes.biometricGate.authentication = err(failure);
      await press(choiceId(VOTE_CHOICE.For));

      await press(TEST_IDS.voteConfirm);

      expect(screen.getByTestId(TEST_IDS.voteDialogError)).toHaveTextContent(t(key));
      expect(fakes.votes.received).toEqual([]);
      expect(fakes.outbox.snapshot()).toEqual([]);
      expect(screen.getByRole('button', { name: t('voting.confirm') })).toBeEnabled();
      expect(screen.getByTestId(TEST_IDS.voteCancel)).toBeTruthy();
    },
  );

  it('casts the vote when the user is recognised on the second attempt', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    fakes.biometricGate.authentication = err(biometricFailed());
    await press(choiceId(VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);
    fakes.biometricGate.authentication = { ok: true, value: undefined };

    await press(TEST_IDS.voteConfirm);

    expect(fakes.votes.recordedVotes()).toHaveLength(1);
    expect(screen.queryByTestId(TEST_IDS.voteDialog)).toBeNull();
    expect(screen.getByTestId(voteOutcomeTestId(OPEN))).toHaveTextContent(t('voting.submitted'));
  });

  it.each([
    [biometricUnavailable(), 'voteBiometric.biometricUnavailable'],
    [biometricNotEnrolled(), 'voteBiometric.biometricNotEnrolled'],
  ] as const)(
    'says a vote needs the biometrics when the device answers %p, and offers only to close',
    async (failure, key) => {
      const { fakes, t } = renderMeeting();
      await findChoices();
      fakes.biometricGate.availability = err(failure);
      await press(choiceId(VOTE_CHOICE.For));

      await press(TEST_IDS.voteConfirm);

      expect(screen.getByTestId(TEST_IDS.voteDialogError)).toHaveTextContent(t(key));
      expect(screen.queryByTestId(TEST_IDS.voteConfirm)).toBeNull();
      expect(screen.getByTestId(TEST_IDS.voteClose)).toBeTruthy();
      expect(fakes.votes.received).toEqual([]);
    },
  );
});

describe('a vote that cannot be saved on the device', () => {
  it('says so, casts nothing and lets the user try again', async () => {
    const { fakes, t } = renderMeeting();
    await findChoices();
    fakes.network.goOffline();
    fakes.outbox.enqueueFailure = storageWriteFailed();
    await press(choiceId(VOTE_CHOICE.For));

    await press(TEST_IDS.voteConfirm);

    expect(screen.getByTestId(TEST_IDS.voteDialogError)).toHaveTextContent(
      t('voting.failure.storageWriteFailed'),
    );
    expect(screen.getByRole('button', { name: t('voting.confirm') })).toBeEnabled();
  });
});

describe('when the session ends while the user is voting', () => {
  it('sends the user to the sign-in screen when somebody else signs in during the prompt', async () => {
    const { fakes, uiStore } = renderMeeting();
    await findChoices();
    fakes.biometricGate.onPrompt = () => {
      fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
    };

    await press(choiceId(VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);

    expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
    expect(uiStore.getState().sessionEndedBy).toBe('sessionChanged');
    expect(fakes.votes.received).toEqual([]);
  });

  it('sends the user to the lock screen when the app locks during the prompt', async () => {
    const { fakes, uiStore } = renderMeeting();
    await findChoices();
    fakes.biometricGate.onPrompt = () => {
      fakes.appLock.lock();
    };

    await press(choiceId(VOTE_CHOICE.For));
    await press(TEST_IDS.voteConfirm);

    expect(uiStore.getState().access).toBe(ACCESS.Locked);
    expect(fakes.votes.received).toEqual([]);
  });
});

describe('a vote that was rejected', () => {
  it('says so with the reason, offers to acknowledge it, and offers no new vote', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: OPEN }), voteUndeliverable(5)));
    const { t } = renderMeeting(SINGLE, { fakes });

    const notice = await screen.findByTestId(voteNoticeTestId(OPEN));

    expect(notice).toHaveTextContent(
      t('voting.rejected', {
        reason: t('voting.reason.voteUndeliverable', { count: 5, formattedCount: '5' }),
      }),
    );
    expect(screen.getByRole('button', { name: t('voting.acknowledge') })).toBeTruthy();
    expect(screen.queryByTestId(choiceId(VOTE_CHOICE.For))).toBeNull();
  });

  it('lets the user vote again once they have acknowledged it, if the rules still allow it', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: OPEN }), voteUndeliverable(5)));
    renderMeeting(SINGLE, { fakes });
    await screen.findByTestId(acknowledgeTestId(OPEN));

    await press(acknowledgeTestId(OPEN));

    expect(await findChoices()).toBeTruthy();
    expect(fakes.outbox.snapshot()).toEqual([]);
  });

  it('says why the acknowledgement failed, when the outbox cannot be written', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: OPEN })));
    fakes.outbox.removeFailure = storageWriteFailed();
    const { t } = renderMeeting(SINGLE, { fakes });
    await screen.findByTestId(acknowledgeTestId(OPEN));

    await press(acknowledgeTestId(OPEN));

    expect(screen.getByText(t('voting.failure.storageWriteFailed'))).toBeTruthy();
    expect(screen.getByTestId(acknowledgeTestId(OPEN))).toBeEnabled();
  });

  it.each([
    [{ code: VOTING_ERROR_CODE.ResolutionClosed }, 'voting.reason.resolutionClosed'],
    [{ code: VOTING_ERROR_CODE.VotingWindowOver }, 'voting.reason.votingWindowOver'],
    [
      { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
      'voting.reason.alreadyVotedRecorded',
    ],
  ] as const)('tells the reason %p in words', async (reason, key) => {
    const fakes = createFakes();
    fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: OPEN }), reason));
    const { t } = renderMeeting(SINGLE, { fakes });

    const notice = await screen.findByTestId(voteNoticeTestId(OPEN));

    expect(notice).toHaveTextContent(t('voting.rejected', { reason: t(key) }));
  });
});

describe('in each language', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'writes the vote, its confirmation and its outcome in %s',
    async (language) => {
      const { t } = renderMeeting(MEETING, { language });
      await findChoices();

      expect(screen.getByRole('header', { name: t('voting.choose') })).toBeTruthy();
      expect(screen.getByText(t('voting.reason.resolutionClosed'))).toBeTruthy();

      await press(choiceId(VOTE_CHOICE.For));
      expect(screen.getByRole('header', { name: t('voting.confirmTitle') })).toBeTruthy();
      expect(screen.getByText(t('voting.confirmFinal'))).toBeTruthy();
      await press(TEST_IDS.voteConfirm);

      expect(screen.getByTestId(voteOutcomeTestId(OPEN))).toHaveTextContent(t('voting.submitted'));
    },
  );

  it('says in French that a vote is final', async () => {
    renderMeeting(SINGLE, { language: 'fr' });
    await findChoices();

    await press(choiceId(VOTE_CHOICE.Abstain));

    expect(
      screen.getByText(
        'Votre vote est définitif. Une fois exprimé, il ne peut être ni modifié ni retiré.',
      ),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmer mon vote' })).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.voteDialogChoice)).toHaveTextContent(
      'Votre choix\u00a0: Abstention',
    );
  });

  it('writes a rejected vote and its reason in French, with the count in the words of the language', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aRejectedVote(aVote({ resolutionId: OPEN }), voteUndeliverable(1)));
    renderMeeting(SINGLE, { fakes, language: 'fr' });

    const notice = await screen.findByTestId(voteNoticeTestId(OPEN));

    expect(notice).toHaveTextContent(
      'Votre vote a été refusé. Votre vote n’a pas pu être transmis après 1 tentative.',
    );
  });
});
