import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { Text } from 'react-native';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import { createFakes } from '@application/testing/createFakes';
import { storageReadFailed } from '@domain/errors/StorageError';
import { aPendingVote, aResolutionId, aVote } from '@domain/testing/builders';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { ACCESS } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { driveAppState } from '../testing/appState';
import { renderScreen } from '../testing/renderScreen';
import type { RenderScreenOptions } from '../testing/renderScreen';

import { SessionController } from './SessionController';

// The session controller, without the navigator: how the app starts, what it follows (the
// connection, the life of the app), and when it sends the votes that wait.

const APP = 'the app';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function setup(options: RenderScreenOptions = {}) {
  const appState = driveAppState();
  const rendered = renderScreen(
    <SessionController>
      <Text>{APP}</Text>
    </SessionController>,
    options,
  );
  return { ...rendered, appState };
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

describe('the start of the session', () => {
  it('shows the loading state, and not the app, until RestoreSession has answered', async () => {
    const fakes = createFakes();
    let answer: () => void = () => undefined;
    const current = fakes.auth.current.bind(fakes.auth);
    fakes.auth.current = () =>
      new Promise((resolve) => {
        answer = () => resolve(current());
      });
    const { t, uiStore } = setup({ fakes, access: ACCESS.Starting });

    expect(screen.getByTestId(TEST_IDS.startupLoading)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: t('startup.loading') })).toBeTruthy();
    expect(screen.queryByText(APP)).toBeNull();
    expect(uiStore.getState().access).toBe(ACCESS.Starting);

    await act(async () => {
      answer();
    });
    await settle();

    expect(screen.queryByTestId(TEST_IDS.startupLoading)).toBeNull();
    expect(screen.getByText(APP)).toBeTruthy();
  });

  it('sends a start with nobody signed in to the sign-in screen', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    const { uiStore } = setup({ fakes, access: ACCESS.Starting });

    await settle();

    expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
  });

  it('sends a start with a stored session to the lock screen: a restored session is always locked', async () => {
    const fakes = createFakes();
    const { uiStore } = setup({ fakes, access: ACCESS.Starting });

    await settle();

    expect(uiStore.getState().access).toBe(ACCESS.Locked);
    expect(fakes.appLock.isLocked()).toBe(true);
  });

  it('sends a start with a session that has expired to the sign-in screen, and forgets the session', async () => {
    const fakes = createFakes();
    fakes.clock.advance(2 * 3_600_000);
    const { uiStore } = setup({ fakes, access: ACCESS.Starting });

    await settle();

    expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
    expect(fakes.auth.session).toBeUndefined();
  });

  it('asks once, however many times it is rendered', async () => {
    const fakes = createFakes();
    const restore = jest.spyOn(fakes.auth, 'current');
    const { rerender } = setup({ fakes, access: ACCESS.Starting });

    rerender(
      <SessionController>
        <Text>{APP}</Text>
      </SessionController>,
    );
    await settle();

    expect(restore.mock.calls.length).toBeLessThanOrEqual(2);
    expect(fakes.appLock.isLocked()).toBe(true);
  });

  describe('when the stored session cannot be read', () => {
    it('says so with a way to try again, and does not show the app', async () => {
      const fakes = createFakes();
      fakes.auth.readFailure = storageReadFailed();
      const { t, uiStore } = setup({ fakes, access: ACCESS.Starting });

      await settle();

      const error = screen.getByTestId(TEST_IDS.restoreError);
      expect(within(error).getByText(t('errors.storageReadFailed'))).toBeTruthy();
      expect(screen.getByRole('button', { name: t('states.retry') })).toBeTruthy();
      expect(screen.queryByText(APP)).toBeNull();
      expect(uiStore.getState().access).toBe(ACCESS.Starting);
    });

    it('goes on to the lock screen when the retry works', async () => {
      const fakes = createFakes();
      fakes.auth.readFailure = storageReadFailed();
      const { t, uiStore } = setup({ fakes, access: ACCESS.Starting });
      await settle();
      fakes.auth.readFailure = undefined;

      fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));
      await settle();

      expect(screen.queryByTestId(TEST_IDS.restoreError)).toBeNull();
      expect(uiStore.getState().access).toBe(ACCESS.Locked);
    });
  });

  it.each(SUPPORTED_LANGUAGES)('says it is starting in %s', (language) => {
    const fakes = createFakes();
    fakes.auth.current = () => new Promise(() => undefined);
    const { t } = setup({ fakes, access: ACCESS.Starting, language });

    expect(screen.getByRole('progressbar', { name: t('startup.loading') })).toBeTruthy();
  });
});

describe('the privacy cover', () => {
  it('is drawn over the app while the store says so, and taken away when it stops', () => {
    const { uiStore } = setup();
    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();

    act(() => {
      uiStore.getState().setPrivacyCover(true);
    });
    expect(screen.getByTestId(TEST_IDS.privacyCover)).toBeTruthy();
    // The app is still there, but out of reach of the screen reader while it is covered.
    expect(screen.queryByText(APP)).toBeNull();
    expect(screen.getByText(APP, { includeHiddenElements: true })).toBeTruthy();

    act(() => {
      uiStore.getState().setPrivacyCover(false);
    });
    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
  });

  it('is drawn when the app goes inactive, and lifted when it is active again', () => {
    const { appState } = setup();

    act(() => appState.emit('inactive'));
    expect(screen.getByTestId(TEST_IDS.privacyCover)).toBeTruthy();

    act(() => appState.emit('active'));
    expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
  });
});

describe('the votes that wait', () => {
  const R1 = aResolutionId('r1');

  function withWaitingVote(options: RenderScreenOptions = {}) {
    const fakes = options.fakes ?? createFakes();
    fakes.outbox.seed(aPendingVote(aVote({ resolutionId: R1 })));
    return setup({ ...options, fakes });
  }

  it('are sent when the app starts open, without anything else happening', async () => {
    const { fakes } = withWaitingVote({ access: ACCESS.Unlocked });

    await settle();

    expect(fakes.votes.received.map((vote) => vote.resolutionId)).toEqual([R1]);
  });

  it('are sent after the user unlocks the app, and not before', async () => {
    const { fakes, uiStore } = withWaitingVote({ access: ACCESS.Locked });
    await settle();
    expect(fakes.votes.received).toEqual([]);

    act(() => {
      uiStore.getState().unlocked();
    });
    await settle();

    expect(fakes.votes.received).toHaveLength(1);
  });

  it('are sent after the user signs in, and not before', async () => {
    const { fakes, uiStore } = withWaitingVote({ access: ACCESS.SignedOut });
    await settle();
    expect(fakes.votes.received).toEqual([]);

    act(() => {
      uiStore.getState().signedIn();
    });
    await settle();

    expect(fakes.votes.received).toHaveLength(1);
  });

  it('are sent when the connection comes back, and not while it is down', async () => {
    const fakes = createFakes();
    fakes.network.goOffline();
    fakes.connectivity.emit(CONNECTIVITY_STATUS.Offline);
    const rendered = withWaitingVote({ fakes, access: ACCESS.Unlocked });
    await settle();
    expect(fakes.votes.received).toHaveLength(1);
    expect(fakes.outbox.snapshot()).toHaveLength(1);
    fakes.votes.received.length = 0;

    fakes.network.goOnline();
    act(() => {
      fakes.connectivity.emit(CONNECTIVITY_STATUS.Online);
    });
    await settle();

    expect(fakes.votes.recordedVotes()).toHaveLength(1);
    expect(fakes.outbox.snapshot()).toEqual([]);
    expect(rendered.uiStore.getState().syncSummary).toEqual({ synced: 1, rejected: 0 });
  });

  it('are sent when the app returns to the foreground, once its lock is judged', async () => {
    const fakes = createFakes();
    fakes.network.goOffline();
    const rendered = withWaitingVote({ fakes, access: ACCESS.Unlocked });
    await settle();
    fakes.network.goOnline();
    fakes.votes.received.length = 0;

    act(() => rendered.appState.emit('background'));
    fakes.clock.advance(1000);
    await act(async () => {
      rendered.appState.emit('active');
    });
    await settle();

    expect(fakes.votes.recordedVotes()).toHaveLength(1);
  });

  it('are not sent when the app returns locked', async () => {
    const fakes = createFakes();
    fakes.network.goOffline();
    const rendered = withWaitingVote({ fakes, access: ACCESS.Unlocked });
    await settle();
    fakes.network.goOnline();
    fakes.votes.received.length = 0;

    act(() => rendered.appState.emit('background'));
    fakes.clock.advance(10 * 60_000);
    await act(async () => {
      rendered.appState.emit('active');
    });
    await settle();

    expect(fakes.votes.received).toEqual([]);
    expect(rendered.uiStore.getState().access).toBe(ACCESS.Locked);
  });
});

describe('a session that a failure ended', () => {
  it.each(['sessionExpired', 'unauthorized', 'notAuthenticated', 'sessionChanged'] as const)(
    'is also forgotten on the device when it is %s, so that a restart does not find it',
    async (code) => {
      const { fakes, uiStore } = setup({ access: ACCESS.Unlocked });
      await settle();

      act(() => {
        uiStore.getState().endSession(code);
      });
      await settle();

      expect(fakes.auth.signOutCalls).toBe(1);
      expect(fakes.auth.session).toBeUndefined();
    },
  );

  it('is not forgotten when it is only the lock: the user unlocks it', async () => {
    const { fakes, uiStore } = setup({ access: ACCESS.Unlocked });
    await settle();

    act(() => {
      uiStore.getState().endSession('appLocked');
    });
    await settle();

    expect(fakes.auth.signOutCalls).toBe(0);
    expect(fakes.auth.session).toBeDefined();
  });

  it('is not signed out again when the user signs out themselves', async () => {
    const { fakes, uiStore } = setup({ access: ACCESS.Unlocked });
    await settle();

    act(() => {
      uiStore.getState().signedOut();
    });
    await settle();

    expect(fakes.auth.signOutCalls).toBe(0);
  });
});
