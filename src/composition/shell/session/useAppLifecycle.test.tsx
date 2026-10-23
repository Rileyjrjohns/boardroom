import { act } from '@testing-library/react-native';
import type { AppStateStatus } from 'react-native';

import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import { MILLIS_PER_MINUTE, aSession, at } from '@testing/domain/builders';
import { TEST_GRACE_PERIOD_MILLIS, renderScreen } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { driveAppState } from '../testing/appState';

import { useAppLifecycle } from './useAppLifecycle';
import { APP_STATE } from './appState';

// What the app does as it goes to the background and comes back: the privacy cover, the lock
// evaluated before anything is shown, and the synchronisation asked for once it is judged.

afterEach(() => {
  jest.restoreAllMocks();
});

function Probe({ onResumed }: { readonly onResumed: () => void }) {
  useAppLifecycle(onResumed);
  return null;
}

function setup(options: RenderScreenOptions = {}, initialState: AppStateStatus = APP_STATE.Active) {
  const appState = driveAppState(initialState);
  const onResumed = jest.fn();
  const rendered = renderScreen(<Probe onResumed={onResumed} />, {
    access: ACCESS.Unlocked,
    ...options,
  });
  return { ...rendered, appState, onResumed };
}

/** The app goes away and comes back after `away` milliseconds, by way of the background. */
async function awayFor(
  rendered: ReturnType<typeof setup>,
  away: number,
  { throughInactive = true }: { throughInactive?: boolean } = {},
): Promise<void> {
  const { appState, fakes } = rendered;
  if (throughInactive) act(() => appState.emit(APP_STATE.Inactive));
  act(() => appState.emit(APP_STATE.Background));
  fakes.clock.advance(away);
  await act(async () => {
    appState.emit(APP_STATE.Active);
  });
}

/**
 * The reads of the stored session wait to be answered, one at a time and in order: the lock is
 * judged with the first, the session is checked with the second. `answerNext` lets one through.
 */
function holdSessionReads(fakes: ReturnType<typeof createFakes>) {
  const read = fakes.auth.current.bind(fakes.auth);
  const waiting: (() => void)[] = [];
  fakes.auth.current = () =>
    new Promise((resolve) => {
      waiting.push(() => resolve(read()));
    });
  return {
    pending: () => waiting.length,
    answerNext: async () => {
      await act(async () => {
        waiting.shift()?.();
      });
    },
  };
}

describe('the privacy cover', () => {
  it.each(['inactive', 'background'] as const)(
    'covers the content as soon as the app is %s',
    (state) => {
      const { appState, uiStore } = setup();
      expect(uiStore.getState().privacyCover).toBe(false);

      act(() => appState.emit(state));

      expect(uiStore.getState().privacyCover).toBe(true);
    },
  );

  it('is on from the start when the app is started in the background', () => {
    const { uiStore } = setup({}, 'background');

    expect(uiStore.getState().privacyCover).toBe(true);
  });

  it('is lifted when the app is active again after a moment of inactivity, with nothing evaluated', async () => {
    const rendered = setup();
    const { appState, uiStore, onResumed } = rendered;

    act(() => appState.emit(APP_STATE.Inactive));
    expect(uiStore.getState().privacyCover).toBe(true);
    act(() => appState.emit(APP_STATE.Active));

    expect(uiStore.getState().privacyCover).toBe(false);
    expect(onResumed).not.toHaveBeenCalled();
  });

  it('stays on while the lock is being judged and the session checked on the way back, so that nothing is shown before', async () => {
    const fakes = createFakes();
    const rendered = setup({ fakes });
    const reads = holdSessionReads(fakes);

    act(() => rendered.appState.emit(APP_STATE.Background));
    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });
    expect(rendered.uiStore.getState().privacyCover).toBe(true);

    await reads.answerNext();
    expect(rendered.uiStore.getState().privacyCover).toBe(true);

    await reads.answerNext();
    expect(rendered.uiStore.getState().privacyCover).toBe(false);
  });

  it('stays on when the app goes away again while the lock is being judged', async () => {
    const fakes = createFakes();
    const rendered = setup({ fakes });
    const reads = holdSessionReads(fakes);
    act(() => rendered.appState.emit(APP_STATE.Background));
    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    act(() => rendered.appState.emit(APP_STATE.Background));
    await reads.answerNext();
    await reads.answerNext();

    expect(rendered.uiStore.getState().privacyCover).toBe(true);
    expect(rendered.onResumed).not.toHaveBeenCalled();
  });

  it('is not on for the states the system can report that hide nothing', () => {
    const { appState, uiStore } = setup();

    act(() => appState.emit('unknown' as never));

    expect(uiStore.getState().privacyCover).toBe(false);
  });
});

describe('the lock on the way back', () => {
  it('does not lock before the grace period is over, and goes on to send the votes', async () => {
    const rendered = setup();

    await awayFor(rendered, TEST_GRACE_PERIOD_MILLIS - 1);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(rendered.fakes.appLock.isLocked()).toBe(false);
    expect(rendered.uiStore.getState().privacyCover).toBe(false);
    expect(rendered.onResumed).toHaveBeenCalledTimes(1);
  });

  it('locks when the grace period is over, before the content is shown again, and sends nothing', async () => {
    const rendered = setup();

    await awayFor(rendered, TEST_GRACE_PERIOD_MILLIS);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
    expect(rendered.fakes.appLock.isLocked()).toBe(true);
    expect(rendered.onResumed).not.toHaveBeenCalled();
  });

  it('locks after a long time away', async () => {
    const rendered = setup();

    await awayFor(rendered, 10 * MILLIS_PER_MINUTE);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
  });

  it('counts the time from the moment the app went to the background, not from the moment it went inactive', async () => {
    const rendered = setup();
    act(() => rendered.appState.emit(APP_STATE.Inactive));
    rendered.fakes.clock.advance(TEST_GRACE_PERIOD_MILLIS);
    act(() => rendered.appState.emit(APP_STATE.Background));
    rendered.fakes.clock.advance(1000);

    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
  });

  it('does not count the system prompt of the biometrics as being away', async () => {
    const rendered = setup();
    act(() => rendered.appState.emit(APP_STATE.Inactive));
    rendered.fakes.clock.advance(5 * MILLIS_PER_MINUTE);

    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(rendered.fakes.appLock.isLocked()).toBe(false);
  });

  it('locks when the clock went back while the app was away, since the time away cannot be known', async () => {
    const rendered = setup();
    act(() => rendered.appState.emit(APP_STATE.Background));
    rendered.fakes.clock.set(at(-MILLIS_PER_MINUTE));

    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
  });

  it('locks when the stored session cannot be read, since it cannot say there is nothing to protect', async () => {
    const rendered = setup();
    rendered.fakes.auth.readFailure = storageReadFailed();

    await awayFor(rendered, 1000);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
    expect(rendered.uiStore.getState().privacyCover).toBe(false);
  });

  it('empties the cache when it locks, so that nothing of the user stays in memory', async () => {
    const rendered = setup();
    rendered.queryClient.setQueryData(['rows'], 'the rows of the user');

    await awayFor(rendered, TEST_GRACE_PERIOD_MILLIS);

    expect(rendered.queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('keeps the cache when it does not lock', async () => {
    const rendered = setup();
    rendered.queryClient.setQueryData(['rows'], 'the rows of the user');

    await awayFor(rendered, 1000);

    expect(rendered.queryClient.getQueryData(['rows'])).toBe('the rows of the user');
  });

  it.each([ACCESS.Locked, ACCESS.SignedOut])(
    'evaluates nothing when the state is %s: there is nothing to lock, and the votes are not sent',
    async (access) => {
      const rendered = setup({ access });
      const evaluate = jest.spyOn(rendered.services.useCases.evaluateAppLock, 'execute');

      await awayFor(rendered, 10 * MILLIS_PER_MINUTE);

      expect(evaluate).not.toHaveBeenCalled();
      expect(rendered.accessStore.getState().access).toBe(access);
      expect(rendered.uiStore.getState().privacyCover).toBe(false);
      expect(rendered.onResumed).not.toHaveBeenCalled();
    },
  );

  it('asks for the votes to be sent, and checks the session once, when it does not lock', async () => {
    const rendered = setup();
    const check = jest.spyOn(rendered.services.useCases.getCurrentUser, 'execute');

    await awayFor(rendered, 1000);

    expect(check).toHaveBeenCalledTimes(1);
    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
  });

  it('does not check the session when it locks: the unlock will', async () => {
    const rendered = setup();
    const check = jest.spyOn(rendered.services.useCases.getCurrentUser, 'execute');

    await awayFor(rendered, 10 * MILLIS_PER_MINUTE);

    expect(check).not.toHaveBeenCalled();
  });

  it('asks for the votes to be sent each time the app comes back, and only then', async () => {
    const rendered = setup();
    expect(rendered.onResumed).not.toHaveBeenCalled();

    await awayFor(rendered, 1000);
    await awayFor(rendered, 2000);

    expect(rendered.onResumed).toHaveBeenCalledTimes(2);
  });

  it('stops listening when it is unmounted', () => {
    const rendered = setup();
    expect(rendered.appState.listenerCount).toBe(1);

    rendered.unmount();

    expect(rendered.appState.listenerCount).toBe(0);
  });
});

describe('a session that ended while the app was away', () => {
  /** The session ends 10 seconds after the start; the grace period is 30. */
  const EXPIRES_IN = 10_000;
  const AWAY = 20_000;

  function setupExpiring() {
    const fakes = createFakes();
    fakes.auth.session = aSession({ expiresAt: at(EXPIRES_IN) });
    const rendered = setup({ fakes });
    const snapshots: { access: string; covered: boolean }[] = [];
    const snapshot = (): void => {
      snapshots.push({
        access: rendered.accessStore.getState().access,
        covered: rendered.uiStore.getState().privacyCover,
      });
    };
    rendered.accessStore.subscribe(snapshot);
    rendered.uiStore.subscribe(snapshot);
    return { ...rendered, snapshots };
  }

  it('ends the session with its reason, and never shows the previous content uncovered', async () => {
    const rendered = setupExpiring();
    rendered.queryClient.setQueryData(['rows'], 'the rows of the previous user');

    await awayFor(rendered, AWAY);

    const { access, sessionEndedBy } = rendered.accessStore.getState();
    const { privacyCover } = rendered.uiStore.getState();
    expect(access).toBe(ACCESS.SignedOut);
    expect(sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);
    expect(privacyCover).toBe(false);
    expect(rendered.queryClient.getQueryData(['rows'])).toBeUndefined();
    // The app is uncovered only once it is no longer showing the open app.
    expect(
      rendered.snapshots.filter(({ access, covered }) => access === ACCESS.Unlocked && !covered),
    ).toEqual([]);
    expect(rendered.onResumed).not.toHaveBeenCalled();
  });

  it('ends the session of somebody who is no longer signed in, with the reason', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    const rendered = setup({ fakes });

    await awayFor(rendered, AWAY);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.SignedOut);
    expect(rendered.accessStore.getState().sessionEndedBy).toBe(
      AUTHENTICATION_ERROR_CODE.NotAuthenticated,
    );
  });

  it('locks, fail closed, when the session cannot be read for the check', async () => {
    const fakes = createFakes();
    const read = fakes.auth.current.bind(fakes.auth);
    let reads = 0;
    fakes.auth.current = () => {
      reads += 1;
      return reads === 1
        ? read()
        : Promise.resolve({ ok: false as const, error: storageReadFailed() });
    };
    const rendered = setup({ fakes });

    await awayFor(rendered, 1000);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Locked);
    expect(rendered.uiStore.getState().privacyCover).toBe(false);
    expect(rendered.onResumed).not.toHaveBeenCalled();
  });

  it('does not put a lock screen back for a session that ended while it was being checked', async () => {
    const fakes = createFakes();
    const rendered = setup({ fakes });
    const read = fakes.auth.current.bind(fakes.auth);
    let reads = 0;
    let answer: () => void = () => undefined;
    fakes.auth.current = () => {
      reads += 1;
      if (reads === 1) return read();
      return new Promise((resolve) => {
        answer = () => resolve({ ok: false, error: storageReadFailed() });
      });
    };
    act(() => rendered.appState.emit(APP_STATE.Background));
    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    act(() => {
      rendered.accessStore.getState().signedOut();
    });
    await act(async () => {
      answer();
    });

    expect(rendered.accessStore.getState().access).toBe(ACCESS.SignedOut);
  });

  it('does not end the session of the user who signed in while it was being checked', async () => {
    const fakes = createFakes();
    const rendered = setup({ fakes });
    const read = fakes.auth.current.bind(fakes.auth);
    let reads = 0;
    let answer: () => void = () => undefined;
    fakes.auth.current = () => {
      reads += 1;
      if (reads === 1) return read();
      return new Promise((resolve) => {
        answer = () => resolve(ok(undefined));
      });
    };
    act(() => rendered.appState.emit(APP_STATE.Background));
    await act(async () => {
      rendered.appState.emit(APP_STATE.Active);
    });

    act(() => {
      rendered.accessStore.getState().signedOut();
      rendered.accessStore.getState().signedIn();
    });
    await act(async () => {
      answer();
    });

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(rendered.accessStore.getState().sessionEndedBy).toBeUndefined();
  });

  it('leaves a session that is still good alone, and uncovers the app', async () => {
    const rendered = setup();
    rendered.queryClient.setQueryData(['rows'], 'the rows of the user');

    await awayFor(rendered, 1000);

    expect(rendered.accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(rendered.uiStore.getState().privacyCover).toBe(false);
    expect(rendered.queryClient.getQueryData(['rows'])).toBe('the rows of the user');
  });
});
