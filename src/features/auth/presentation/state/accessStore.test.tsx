import { render } from '@testing-library/react-native';

import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { SESSION_RESTORE } from '@features/auth/application/use-cases/RestoreSession';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';

import {
  ACCESS,
  AccessStoreProvider,
  createAccessStore,
  useAccessStore,
  useAccessStoreApi,
} from './accessStore';
import { useSessionOpen } from './useSessionOpen';

/** The epoch of an open app, as a check that starts now would read it. */
const epochOf = (store: ReturnType<typeof createAccessStore>): number =>
  store.getState().accessEpoch;

describe('where the user stands', () => {
  it('starts before anything is known, and nothing is held about the session', () => {
    const state = createAccessStore().getState();

    expect(state.access).toBe(ACCESS.Starting);
    expect(state.accessEpoch).toBe(0);
    expect(state.sessionEndedBy).toBeUndefined();
  });

  it('can start where a test of an open screen needs it', () => {
    expect(createAccessStore({ access: ACCESS.Unlocked }).getState().access).toBe(ACCESS.Unlocked);
  });

  it('sends a start with nobody signed in to the sign-in screen', () => {
    const store = createAccessStore();

    store.getState().sessionRestored(SESSION_RESTORE.None);

    expect(store.getState().access).toBe(ACCESS.SignedOut);
  });

  it('sends a restored session to the lock screen, never straight to the app', () => {
    const store = createAccessStore();

    store.getState().sessionRestored(SESSION_RESTORE.UnlockRequired);

    expect(store.getState().access).toBe(ACCESS.Locked);
  });

  it('takes the answer of the restoration once: a late one cannot undo what the user did since', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });

    store.getState().sessionRestored(SESSION_RESTORE.None);

    expect(store.getState().access).toBe(ACCESS.Unlocked);
  });

  it('opens on a sign-in and on an unlock, and forgets why the user had been sent away', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epochOf(store));
    expect(store.getState().sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);

    store.getState().signedIn();
    expect(store.getState().access).toBe(ACCESS.Unlocked);
    expect(store.getState().sessionEndedBy).toBeUndefined();

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.AppLocked, epochOf(store));
    store.getState().unlocked();
    expect(store.getState().access).toBe(ACCESS.Unlocked);
    expect(store.getState().sessionEndedBy).toBeUndefined();
  });

  it('locks, and signs out, forgetting what the session left to tell', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epochOf(store));
    store.getState().signedIn();

    store.getState().locked(epochOf(store));
    expect(store.getState().access).toBe(ACCESS.Locked);
    expect(store.getState().sessionEndedBy).toBeUndefined();

    store.getState().unlocked();
    store.getState().signedOut();
    expect(store.getState().access).toBe(ACCESS.SignedOut);
    expect(store.getState().sessionEndedBy).toBeUndefined();
  });

  it.each([
    [REPOSITORY_ERROR_CODE.Unauthorized, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.NotAuthenticated, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.SessionExpired, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.SessionChanged, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.AppLocked, ACCESS.Locked],
  ] as const)('sends the user to the right screen when %s ends the session', (code, access) => {
    const store = createAccessStore({ access: ACCESS.Unlocked });

    store.getState().endSession(code, epochOf(store));

    expect(store.getState().access).toBe(access);
    expect(store.getState().sessionEndedBy).toBe(code);
  });

  it('ignores a failure that arrives after the user left the open app', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    const epoch = epochOf(store);
    store.getState().signedOut();

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.NotAuthenticated, epoch);

    expect(store.getState().sessionEndedBy).toBeUndefined();
    expect(store.getState().access).toBe(ACCESS.SignedOut);
  });
});

describe('the epoch of the access', () => {
  it('goes up every time the user moves, and not when nothing changes', () => {
    const store = createAccessStore();
    const epochs = [epochOf(store)];
    const note = () => epochs.push(epochOf(store));

    store.getState().sessionRestored(SESSION_RESTORE.UnlockRequired);
    note();
    store.getState().unlocked();
    note();
    store.getState().locked(epochOf(store));
    note();
    store.getState().unlocked();
    note();
    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epochOf(store));
    note();
    store.getState().signedIn();
    note();
    store.getState().signedOut();
    note();
    // Nothing changes: signed out already.
    store.getState().signedOut();
    note();

    expect(epochs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7]);
  });

  it('drops a result of a run that started for the user who left, then somebody else signed in', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    const first = epochOf(store);
    store.getState().signedOut();
    store.getState().signedIn();
    expect(store.getState().access).toBe(ACCESS.Unlocked);

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionChanged, first);
    store.getState().locked(first);

    expect(store.getState().access).toBe(ACCESS.Unlocked);
    expect(store.getState().sessionEndedBy).toBeUndefined();
  });

  it('applies a result of the access it started under', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    const epoch = epochOf(store);

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epoch);

    expect(store.getState().access).toBe(ACCESS.SignedOut);
    expect(store.getState().sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);
  });
});

describe('the transitions that are guarded', () => {
  it('locks only an open app: a late check does not put a lock screen back for a session that ended', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    const epoch = epochOf(store);
    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epoch);

    store.getState().locked(epoch);

    expect(store.getState().access).toBe(ACCESS.SignedOut);
    expect(store.getState().sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);
  });

  it.each([ACCESS.Starting, ACCESS.SignedOut, ACCESS.Locked])('does not lock from %s', (access) => {
    const store = createAccessStore({ access });

    store.getState().locked(epochOf(store));

    expect(store.getState().access).toBe(access);
    expect(store.getState().accessEpoch).toBe(0);
  });

  it.each([ACCESS.Starting, ACCESS.SignedOut, ACCESS.Unlocked])(
    'does not unlock from %s',
    (access) => {
      const store = createAccessStore({ access });

      store.getState().unlocked();

      expect(store.getState().access).toBe(access);
      expect(store.getState().accessEpoch).toBe(0);
    },
  );

  it.each([ACCESS.Starting, ACCESS.Locked, ACCESS.Unlocked])(
    'does not sign in from %s',
    (access) => {
      const store = createAccessStore({ access });

      store.getState().signedIn();

      expect(store.getState().access).toBe(access);
      expect(store.getState().accessEpoch).toBe(0);
    },
  );

  it.each([ACCESS.Starting, ACCESS.Locked, ACCESS.Unlocked])(
    'signs out from %s: the user can forget a session whatever it is doing',
    (access) => {
      const store = createAccessStore({ access });

      store.getState().signedOut();

      expect(store.getState().access).toBe(ACCESS.SignedOut);
    },
  );

  it.each([ACCESS.Starting, ACCESS.SignedOut, ACCESS.Locked])(
    'has no session to end from %s',
    (access) => {
      const store = createAccessStore({ access });

      store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired, epochOf(store));

      expect(store.getState().access).toBe(access);
      expect(store.getState().sessionEndedBy).toBeUndefined();
    },
  );
});

describe('createAccessStore', () => {
  it('creates a new store at every call: no state is shared between two', () => {
    const first = createAccessStore();
    const second = createAccessStore({ access: ACCESS.Unlocked });

    first.getState().sessionRestored(SESSION_RESTORE.None);

    expect(second.getState().access).toBe(ACCESS.Unlocked);
    expect(first.getState().access).toBe(ACCESS.SignedOut);
  });

  it('notifies its subscribers of a change', () => {
    const store = createAccessStore();
    const seen: string[] = [];
    store.subscribe((state) => seen.push(state.access));

    store.getState().sessionRestored(SESSION_RESTORE.None);

    expect(seen).toEqual([ACCESS.SignedOut]);
  });
});

describe('AccessStoreProvider', () => {
  it('provides the store it is given, so that what is outside React and what is inside see one', () => {
    const store = createAccessStore({ access: ACCESS.Unlocked });
    const given: unknown[] = [];
    function Probe() {
      given.push(useAccessStoreApi());
      return null;
    }

    render(
      <AccessStoreProvider store={store}>
        <Probe />
      </AccessStoreProvider>,
    );

    expect(given[0]).toBe(store);
  });

  it('creates a store of its own when it is given none, at the start of the app', () => {
    const states: string[] = [];
    function Probe() {
      states.push(useAccessStore((state) => state.access));
      return null;
    }

    render(
      <AccessStoreProvider>
        <Probe />
      </AccessStoreProvider>,
    );

    expect(states).toEqual([ACCESS.Starting]);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree, not a state', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    function Read() {
      useAccessStore((state) => state.access);
      return null;
    }
    function Api() {
      useAccessStoreApi();
      return null;
    }
    expect(() => render(<Read />)).toThrow('AccessStoreProvider');
    expect(() => render(<Api />)).toThrow('AccessStoreProvider');

    error.mockRestore();
  });
});

describe('useSessionOpen', () => {
  it.each([
    [ACCESS.Starting, false],
    [ACCESS.SignedOut, false],
    [ACCESS.Locked, false],
    [ACCESS.Unlocked, true],
  ])('is told from %s: open only when signed in and unlocked', (access, open) => {
    const given: unknown[] = [];
    function Probe() {
      given.push(useSessionOpen());
      return null;
    }

    render(
      <AccessStoreProvider store={createAccessStore({ access })}>
        <Probe />
      </AccessStoreProvider>,
    );

    expect(given).toEqual([open]);
  });

  it('refuses to be read outside of a provider', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    function Open() {
      useSessionOpen();
      return null;
    }
    expect(() => render(<Open />)).toThrow('AccessStoreProvider');

    error.mockRestore();
  });
});
