import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { biometricFailed } from '@core/domain/errors/BiometricError';
import { networkUnavailable, unauthorized } from '@core/domain/errors/RepositoryError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err } from '@core/domain/shared/Result';
import { createFormatters } from '@core/presentation/format/formatters';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import { translateCount } from '@core/presentation/i18n/translateCount';
import { queryKeys } from '@core/presentation/query/queryKeys';
import {
  TEST_IDS,
  meetingRowTestId,
  pendingVoteTestId,
  rejectedVoteTestId,
} from '@core/presentation/testIds';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { createFakes } from '@testing/application/createFakes';
import {
  MILLIS_PER_MINUTE,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  anEmail,
} from '@testing/domain/builders';
import { renderApp } from '@testing/presentation/renderApp';
import type { RenderAppOptions } from '@testing/presentation/renderApp';
import { TEST_GRACE_PERIOD_MILLIS } from '@testing/presentation/renderScreen';

import { driveAppState } from '../testing/appState';
import { APP_STATE } from '../session/appState';

// The session flow through the real navigator and the real route files of the app: where the user
// lands at the start, what a link can reach, what the back stack holds, and what is left of the
// user's data on the screen and in memory once they have left. The use cases are the real ones
// over the fakes of the ports; the lifecycle of the app is driven by hand.

const MEETING = aMeeting({
  summary: aMeetingSummary({ id: aMeetingId('meeting-1'), title: 'Board of directors' }),
});
const OTHER = aMeeting({
  summary: aMeetingSummary({ id: aMeetingId('meeting-2'), title: 'Audit committee' }),
});
const PASSWORD = 'secret';

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

interface StartOptions extends RenderAppOptions {
  /** False: nobody is signed in when the app starts. */
  readonly session?: boolean;
}

function startApp({ session = true, ...options }: StartOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  if (!session) {
    fakes.auth.session = undefined;
    fakes.appLock.lock();
  }
  fakes.meetings.addMeeting(MEETING);
  fakes.meetings.addMeeting(OTHER);
  fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, [MEETING, OTHER]);
  const appState = driveAppState();
  const app = renderApp({ ...options, fakes });
  return { ...app, appState };
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

async function signIn(): Promise<void> {
  fireEvent.changeText(await screen.findByTestId(TEST_IDS.signInEmail), 'alice@example.com');
  fireEvent.changeText(screen.getByTestId(TEST_IDS.signInPassword), PASSWORD);
  await press(TEST_IDS.signInSubmit);
}

async function unlock(): Promise<void> {
  await press(TEST_IDS.lockUnlock);
}

/** What the header of the screens of the stack show as their title, first screen to last. */
function headerTitles(): string[] {
  const titles: string[] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return;
    const rendered = node as {
      type?: string;
      props?: Record<string, unknown>;
      children?: unknown[] | null;
    };
    if (
      rendered.type === 'RNSScreenStackHeaderConfig' &&
      typeof rendered.props?.title === 'string'
    ) {
      titles.push(rendered.props.title);
    }
    rendered.children?.forEach(visit);
  };
  const tree = screen.toJSON();
  [tree ?? []].flat().forEach(visit);
  return titles;
}

describe('the start of the app', () => {
  it('opens on the sign-in screen when nobody is signed in', async () => {
    const { getPathname } = startApp({ session: false });

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(getPathname()).toBe('/sign-in');
    expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.lockScreen)).toBeNull();
  });

  it('opens on the lock screen when a session is restored: it always needs the unlock', async () => {
    const { getPathname, fakes } = startApp();

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(getPathname()).toBe('/lock');
    expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    expect(fakes.meetings.listCalls).toEqual([]);
  });

  it('shows nothing of the user on the lock screen', async () => {
    startApp();
    await screen.findByTestId(TEST_IDS.lockScreen);

    expect(screen.queryByText(/Alice/)).toBeNull();
    expect(screen.queryByText(/alice@/)).toBeNull();
    expect(screen.queryByText(MEETING.title)).toBeNull();
  });

  it('lands on the meetings list after a sign-in, with nothing to go back to', async () => {
    const { getPathname } = startApp({ session: false });

    await signIn();

    expect(await screen.findByTestId(meetingRowTestId(MEETING.id))).toBeTruthy();
    expect(getPathname()).toBe('/');
    expect(screen.queryByTestId(TEST_IDS.signInScreen)).toBeNull();
    expect(router.canGoBack()).toBe(false);
  });

  it('lands on the meetings list after the unlock, with nothing to go back to', async () => {
    const { getPathname, fakes } = startApp();
    await screen.findByTestId(TEST_IDS.lockScreen);

    await unlock();

    expect(await screen.findByTestId(meetingRowTestId(MEETING.id))).toBeTruthy();
    expect(getPathname()).toBe('/');
    expect(router.canGoBack()).toBe(false);
    expect(fakes.appLock.isLocked()).toBe(false);
  });

  it('stays on the lock screen when the biometrics refuse, and shows nothing of the meetings', async () => {
    const { fakes, getPathname } = startApp();
    await screen.findByTestId(TEST_IDS.lockScreen);
    fakes.biometricGate.authentication = err(biometricFailed());

    await unlock();

    expect(screen.getByTestId(TEST_IDS.lockError)).toBeTruthy();
    expect(getPathname()).toBe('/lock');
    expect(fakes.meetings.listCalls).toEqual([]);
  });
});

describe('the titles of the header', () => {
  it.each(SUPPORTED_LANGUAGES)('are in the language of the user, in %s', async (language) => {
    const { t } = createI18n(language);
    const signInTitle = t('navigation.signIn');
    const listTitle = t('navigation.meetings');
    const pendingTitle = t('navigation.pendingVotes');
    const fakes = createFakes();
    fakes.auth.session = undefined;
    fakes.appLock.lock();
    startApp({ fakes, language });
    await screen.findByTestId(TEST_IDS.signInScreen);
    expect(headerTitles()).toEqual([signInTitle]);

    await signIn();
    await screen.findByTestId(TEST_IDS.meetingsList);
    expect(headerTitles()).toEqual([listTitle]);

    await press(TEST_IDS.pendingVotesButton);
    expect(headerTitles()).toEqual([listTitle, pendingTitle]);
  });

  it.each(SUPPORTED_LANGUAGES)('are those of the lock screen, in %s', async (language) => {
    startApp({ language });
    await screen.findByTestId(TEST_IDS.lockScreen);

    expect(headerTitles()).toEqual([createI18n(language).t('navigation.locked')]);
  });
});

describe('a link to a protected screen', () => {
  it.each(['/meetings/meeting-1', '/pending-votes', '/'])(
    'lands on the sign-in screen, whatever %s asks for, when nobody is signed in',
    async (url) => {
      const { getPathname } = startApp({ session: false, initialUrl: url });

      expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
      expect(getPathname()).toBe('/sign-in');
      expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
    },
  );

  it.each(['/meetings/meeting-1', '/pending-votes', '/'])(
    'lands on the lock screen, whatever %s asks for, when the app is locked',
    async (url) => {
      const { getPathname, fakes } = startApp({ initialUrl: url });

      expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
      expect(getPathname()).toBe('/lock');
      expect(fakes.meetings.getCalls).toEqual([]);
    },
  );

  it('reaches the sign-in and lock screens only when they are the ones that exist', async () => {
    startApp({ initialUrl: '/sign-in' });

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.signInScreen)).toBeNull();
  });

  it('lands on the list, not on the meeting the link named, once the user has signed in: the link is not kept', async () => {
    const { getPathname, fakes } = startApp({ session: false, initialUrl: '/meetings/meeting-1' });
    await screen.findByTestId(TEST_IDS.signInScreen);

    await signIn();

    expect(await screen.findByTestId(TEST_IDS.meetingsList)).toBeTruthy();
    expect(getPathname()).toBe('/');
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
    expect(fakes.meetings.getCalls).toEqual([]);
  });

  it('lands on the list, not on the meeting the link named, once the user has unlocked', async () => {
    const { getPathname } = startApp({ initialUrl: '/meetings/meeting-1' });
    await screen.findByTestId(TEST_IDS.lockScreen);

    await unlock();

    expect(await screen.findByTestId(TEST_IDS.meetingsList)).toBeTruthy();
    expect(getPathname()).toBe('/');
  });

  it('is not followed by the navigation of the app while the app is locked', async () => {
    const { getPathname, fakes } = startApp();
    await screen.findByTestId(TEST_IDS.lockScreen);

    act(() => {
      router.push('/meetings/meeting-1');
    });
    await settle();

    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
    expect(getPathname()).not.toBe('/meetings/meeting-1');
    expect(fakes.meetings.getCalls).toEqual([]);
  });

  it('opens a meeting the normal way once the user is in', async () => {
    const { getPathname } = startApp({ session: false });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));

    await press(meetingRowTestId(MEETING.id));

    expect(await screen.findByTestId(TEST_IDS.meetingDetail)).toBeTruthy();
    expect(getPathname()).toBe('/meetings/meeting-1');
    expect(router.canGoBack()).toBe(true);
  });
});

describe('signing out', () => {
  async function openList(options: StartOptions = {}) {
    const app = startApp({ session: false, ...options });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));
    return app;
  }

  it('asks for a confirmation first, and does nothing when the user cancels', async () => {
    const { fakes } = await openList();

    await press(TEST_IDS.signOutButton);
    expect(screen.getByTestId(TEST_IDS.signOutDialog)).toBeTruthy();
    await press(TEST_IDS.signOutCancel);

    expect(screen.queryByTestId(TEST_IDS.signOutDialog)).toBeNull();
    expect(fakes.auth.session).toBeDefined();
    expect(screen.getByTestId(TEST_IDS.meetingsList)).toBeTruthy();
  });

  it('signs out when confirmed, and returns to the sign-in screen', async () => {
    const { fakes, getPathname } = await openList();

    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(getPathname()).toBe('/sign-in');
    expect(fakes.auth.session).toBeUndefined();
    expect(fakes.meetingCache.isEmpty()).toBe(true);
  });

  it('leaves nothing to go back to: the back stack does not hold the screens it left', async () => {
    await openList();
    await press(meetingRowTestId(MEETING.id));
    await screen.findByTestId(TEST_IDS.meetingDetail);
    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);

    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);
    await screen.findByTestId(TEST_IDS.signInScreen);

    expect(router.canGoBack()).toBe(false);
    expect(screen.getByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
  });

  it('removes the data from the screen and from memory: no title, no row, nothing in the query cache', async () => {
    const { queryClient } = await openList();
    await press(meetingRowTestId(MEETING.id));
    await screen.findByRole('header', { name: MEETING.title });
    act(() => {
      router.back();
    });
    await screen.findByTestId(TEST_IDS.meetingsList);
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);
    await screen.findByTestId(TEST_IDS.signInScreen);

    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(screen.queryByText(OTHER.title)).toBeNull();
    expect(screen.queryAllByTestId(/^meeting-row-/)).toEqual([]);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('goes to the lock screen when the session could not be forgotten, and offers to sign out again: the use case has locked the app', async () => {
    const { fakes, queryClient } = await openList();
    fakes.auth.signOutFailure = storageWriteFailed();

    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);

    // Nothing of the user stays on display with nothing behind it: the app is locked, and says so.
    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(fakes.appLock.isLocked()).toBe(true);
    expect(fakes.auth.session).toBeDefined();

    // Signing out is offered on the lock screen, and works once the storage does.
    fakes.auth.signOutFailure = undefined;
    await press(TEST_IDS.lockSignOut);
    await press(TEST_IDS.signOutConfirm);
    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(fakes.auth.session).toBeUndefined();
  });

  it('does not ask for anything once the user has left', async () => {
    const { fakes } = await openList();
    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);
    await screen.findByTestId(TEST_IDS.signInScreen);
    const asked = fakes.meetings.listCalls.length;

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * MILLIS_PER_MINUTE);
    });

    expect(fakes.meetings.listCalls).toHaveLength(asked);
  });

  it('keeps the votes that wait, and says so in the confirmation', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: aResolutionId('r1') })));
    // The synchronisation that follows the sign-in does not reach the server.
    fakes.votes.answerNext(err(networkUnavailable()));
    await openList({ fakes });

    await press(TEST_IDS.signOutButton);

    expect(screen.getByTestId(TEST_IDS.signOutPending)).toHaveTextContent(
      translateCount(createI18n('en').t, 'signOut.pending', 1, createFormatters('en').number),
    );
    await press(TEST_IDS.signOutConfirm);
    await screen.findByTestId(TEST_IDS.signInScreen);
    expect(fakes.outbox.snapshot()).toHaveLength(1);
  });

  it('shows the next user to sign in none of the first user’s meetings, not even while theirs load', async () => {
    const fakes = createFakes();
    fakes.auth.registerAccount(
      anEmail('bruno@example.com'),
      PASSWORD,
      aSession({
        user: aUser({
          id: aUserId('user-2'),
          fullName: 'Bruno Durand',
          email: anEmail('bruno@example.com'),
        }),
      }),
    );
    const { queryClient } = await openList({ fakes });
    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);
    await screen.findByTestId(TEST_IDS.signInScreen);
    let release: () => void = () => undefined;
    fakes.meetings.onRequest = () =>
      new Promise<void>((resolve) => {
        release = resolve;
      });

    fireEvent.changeText(screen.getByTestId(TEST_IDS.signInEmail), 'bruno@example.com');
    fireEvent.changeText(screen.getByTestId(TEST_IDS.signInPassword), PASSWORD);
    await press(TEST_IDS.signInSubmit);

    expect(await screen.findByTestId(TEST_IDS.meetingsLoading)).toBeTruthy();
    expect(screen.queryByTestId(meetingRowTestId(MEETING.id))).toBeNull();
    expect(
      queryClient.getQueryData(queryKeys.meetings.list(MEETING_PERIOD.Upcoming, 3)),
    ).toBeUndefined();
    await act(async () => {
      release();
    });
    await settle();
  });
});

describe('the lock on the way back from the background', () => {
  async function openMeeting() {
    const app = startApp({ session: false });
    await signIn();
    await press(meetingRowTestId(MEETING.id));
    await screen.findByTestId(TEST_IDS.meetingDetail);
    return app;
  }

  async function awayFor(app: ReturnType<typeof startApp>, away: number): Promise<void> {
    act(() => app.appState.emit(APP_STATE.Inactive));
    act(() => app.appState.emit(APP_STATE.Background));
    app.fakes.clock.advance(away);
    await act(async () => {
      app.appState.emit(APP_STATE.Active);
    });
    await settle();
  }

  it('leaves the app where it was when the user is back before the grace period is over', async () => {
    const app = await openMeeting();

    await awayFor(app, TEST_GRACE_PERIOD_MILLIS - 1);

    expect(screen.getByTestId(TEST_IDS.meetingDetail)).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.lockScreen)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
    expect(app.getPathname()).toBe('/meetings/meeting-1');
  });

  it('shows the lock screen, and nothing of the meeting, when the user is back after the grace period', async () => {
    const app = await openMeeting();

    await awayFor(app, TEST_GRACE_PERIOD_MILLIS);

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(app.getPathname()).toBe('/lock');
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
  });

  it('empties the data of the user from memory when it locks', async () => {
    const app = await openMeeting();
    expect(app.queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await awayFor(app, TEST_GRACE_PERIOD_MILLIS);
    await screen.findByTestId(TEST_IDS.lockScreen);

    expect(app.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('does not keep the back stack: after the unlock, the user is on the list and the meeting is not behind it', async () => {
    const app = await openMeeting();
    await awayFor(app, TEST_GRACE_PERIOD_MILLIS);
    await screen.findByTestId(TEST_IDS.lockScreen);
    expect(router.canGoBack()).toBe(false);

    await unlock();

    expect(await screen.findByTestId(TEST_IDS.meetingsList)).toBeTruthy();
    expect(app.getPathname()).toBe('/');
    expect(router.canGoBack()).toBe(false);
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
  });

  it('does not ask the server for anything while it is locked', async () => {
    const app = await openMeeting();
    await awayFor(app, TEST_GRACE_PERIOD_MILLIS);
    await screen.findByTestId(TEST_IDS.lockScreen);
    const lists = app.fakes.meetings.listCalls.length;
    const gets = app.fakes.meetings.getCalls.length;

    await act(async () => {
      await jest.advanceTimersByTimeAsync(10 * MILLIS_PER_MINUTE);
    });

    expect(app.fakes.meetings.listCalls).toHaveLength(lists);
    expect(app.fakes.meetings.getCalls).toHaveLength(gets);
  });
});

describe('the privacy cover', () => {
  it('hides the meetings from the screen reader and from the snapshot while the app is inactive', async () => {
    const app = startApp({ session: false });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));

    act(() => app.appState.emit(APP_STATE.Inactive));

    expect(screen.getByTestId(TEST_IDS.privacyCover)).toBeTruthy();
    expect(screen.queryByTestId(meetingRowTestId(MEETING.id))).toBeNull();
  });

  it('is lifted when the app is active again, and the meetings are there as they were', async () => {
    const app = startApp({ session: false });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));
    act(() => app.appState.emit(APP_STATE.Inactive));

    act(() => app.appState.emit(APP_STATE.Active));

    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
    expect(screen.getByTestId(meetingRowTestId(MEETING.id))).toBeTruthy();
  });

  it('covers the lock and sign-in screens too: nothing of the app shows in the app switcher', async () => {
    const app = startApp({ session: false });
    await screen.findByTestId(TEST_IDS.signInScreen);

    act(() => app.appState.emit(APP_STATE.Background));

    expect(screen.getByTestId(TEST_IDS.privacyCover)).toBeTruthy();
  });
});

describe('a session that ends while the user is using the app', () => {
  async function openList(options: StartOptions = {}) {
    const app = startApp({ session: false, ...options });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));
    return app;
  }

  async function refresh(): Promise<void> {
    await act(async () => {
      screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.onRefresh();
    });
    await settle();
  }

  it('sends the user to the sign-in screen, with the reason, when the server refuses the session', async () => {
    const { fakes, queryClient, getPathname } = await openList();
    const { t } = createI18n('en');
    fakes.meetings.failure = unauthorized();

    await refresh();

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(getPathname()).toBe('/sign-in');
    expect(screen.getByTestId(TEST_IDS.sessionNotice)).toHaveTextContent(t('errors.unauthorized'));
    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(router.canGoBack()).toBe(false);
  });

  it('also forgets the session on the device, so that a restart does not find it', async () => {
    const { fakes } = await openList();
    fakes.meetings.failure = unauthorized();

    await refresh();
    await screen.findByTestId(TEST_IDS.signInScreen);

    expect(fakes.auth.session).toBeUndefined();
  });

  it('sends the user to the sign-in screen, with the reason, when the session expires', async () => {
    const { fakes } = await openList();
    const { t } = createI18n('en');
    fakes.clock.advance(2 * 3_600_000);

    await refresh();

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.sessionNotice)).toHaveTextContent(
      t('errors.sessionExpired'),
    );
  });

  it('sends the user to the lock screen, with the reason, when the app is locked under them', async () => {
    const { fakes, getPathname } = await openList();
    const { t } = createI18n('en');
    fakes.appLock.lock();

    await refresh();

    expect(await screen.findByTestId(TEST_IDS.lockScreen)).toBeTruthy();
    expect(getPathname()).toBe('/lock');
    expect(screen.getByTestId(TEST_IDS.sessionNotice)).toHaveTextContent(t('errors.appLocked'));
    expect(screen.queryByText(MEETING.title)).toBeNull();
  });

  it('sends the user to the sign-in screen when somebody else is signed in now', async () => {
    const { fakes } = await openList();
    const { t } = createI18n('en');
    fakes.meetings.onRequest = () => {
      fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
    };

    await refresh();

    expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.sessionNotice)).toHaveTextContent(
      t('errors.sessionChanged'),
    );
  });

  it('forgets the reason once the user has signed in again', async () => {
    const { fakes } = await openList();
    fakes.meetings.failure = unauthorized();
    await refresh();
    await screen.findByTestId(TEST_IDS.signInScreen);
    fakes.meetings.failure = undefined;

    await signIn();
    await screen.findByTestId(TEST_IDS.meetingsList);
    await press(TEST_IDS.signOutButton);
    await press(TEST_IDS.signOutConfirm);

    await screen.findByTestId(TEST_IDS.signInScreen);
    expect(screen.queryByTestId(TEST_IDS.sessionNotice)).toBeNull();
  });
});

describe('the pending votes', () => {
  async function openList(options: StartOptions = {}) {
    const app = startApp({ session: false, ...options });
    await signIn();
    await screen.findByTestId(meetingRowTestId(MEETING.id));
    return app;
  }

  it('are reached from the header of the list, with their count in a badge, and the way back leads to the list', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(
      aPendingVote(aVote({ resolutionId: aResolutionId('r1') })),
      aRejectedVote(aVote({ resolutionId: aResolutionId('r2') })),
    );
    // The synchronisation that follows the sign-in does not reach the server.
    fakes.votes.answerNext(err(networkUnavailable()));
    const { getPathname } = await openList({ fakes });
    await settle();
    expect(screen.getByTestId(TEST_IDS.pendingVotesBadge)).toHaveTextContent('2');

    await press(TEST_IDS.pendingVotesButton);

    expect(await screen.findByTestId(TEST_IDS.pendingVotesScreen)).toBeTruthy();
    expect(getPathname()).toBe('/pending-votes');
    expect(screen.getByTestId(pendingVoteTestId(aResolutionId('r1')))).toBeTruthy();
    expect(screen.getByTestId(rejectedVoteTestId(aResolutionId('r2')))).toBeTruthy();
    act(() => {
      router.back();
    });
    expect(await screen.findByTestId(TEST_IDS.meetingsList)).toBeTruthy();
  });

  it('shows no badge when there is none, and the screen says so', async () => {
    const { getPathname } = await openList();
    await settle();
    expect(screen.queryByTestId(TEST_IDS.pendingVotesBadge)).toBeNull();

    await press(TEST_IDS.pendingVotesButton);

    expect(await screen.findByTestId(TEST_IDS.pendingVotesEmpty)).toBeTruthy();
    expect(getPathname()).toBe('/pending-votes');
  });

  it('lead to the meeting a vote was cast in', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(
      aPendingVote(aVote({ resolutionId: aResolutionId('r1'), meetingId: MEETING.id })),
    );
    // The synchronisation that follows the sign-in does not reach the server.
    fakes.votes.answerNext(err(networkUnavailable()));
    const { getPathname } = await openList({ fakes });
    await press(TEST_IDS.pendingVotesButton);
    await screen.findByTestId(TEST_IDS.pendingVotesWaiting);

    await press(`open-vote-meeting-${aResolutionId('r1')}`);

    await waitFor(() => {
      expect(getPathname()).toBe('/meetings/meeting-1');
    });
  });

  it('are not reachable from the lock screen or the sign-in screen: they have no header actions', async () => {
    startApp();
    await screen.findByTestId(TEST_IDS.lockScreen);

    expect(screen.queryByTestId(TEST_IDS.pendingVotesButton)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.signOutButton)).toBeNull();
  });
});

describe('in each language', () => {
  it.each(SUPPORTED_LANGUAGES)('shows the whole session flow in %s', async (language) => {
    const { t } = createI18n(language);
    startApp({ session: false, language });
    expect(await screen.findByRole('header', { name: t('signIn.title') })).toBeTruthy();

    await signIn();
    await screen.findByTestId(TEST_IDS.meetingsList);
    expect(screen.getByRole('button', { name: t('signOut.action') })).toBeTruthy();

    await press(TEST_IDS.signOutButton);
    expect(screen.getByRole('header', { name: t('signOut.title') })).toBeTruthy();
    await press(TEST_IDS.signOutConfirm);

    expect(await screen.findByRole('header', { name: t('signIn.title') })).toBeTruthy();
  });
});
