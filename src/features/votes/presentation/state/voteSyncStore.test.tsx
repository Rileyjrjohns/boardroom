import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { ACCESS, createAccessStore } from '@features/auth/presentation/state/accessStore';
import type { AccessStore } from '@features/auth/presentation/state/accessStore';

import {
  VoteSyncStoreProvider,
  createVoteSyncStore,
  useVoteSyncStore,
  useVoteSyncStoreApi,
} from './voteSyncStore';

/** The epoch of an open app, as a run that starts now would read it. */
const epochOf = (store: AccessStore): number => store.getState().accessEpoch;

function anOpenApp() {
  const access = createAccessStore({ access: ACCESS.Unlocked });
  return { access, summaries: createVoteSyncStore(access) };
}

describe('the summary of the synchronisation', () => {
  it('starts with nothing to tell', () => {
    expect(anOpenApp().summaries.getState().syncSummary).toBeUndefined();
  });

  it('adds up the runs until the user dismisses it, instead of keeping the last one', () => {
    const { access, summaries } = anOpenApp();
    const epoch = epochOf(access);

    summaries.getState().showSyncSummary({ synced: 2, rejected: 0 }, epoch);
    summaries.getState().showSyncSummary({ synced: 1, rejected: 1 }, epoch);

    expect(summaries.getState().syncSummary).toEqual({ synced: 3, rejected: 1 });

    summaries.getState().dismissSyncSummary();
    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epoch);

    expect(summaries.getState().syncSummary).toEqual({ synced: 1, rejected: 0 });
  });

  it('does not show a result of the synchronisation to a user who has left the open app', () => {
    const access = createAccessStore({ access: ACCESS.Locked });
    const summaries = createVoteSyncStore(access);

    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(access));

    expect(summaries.getState().syncSummary).toBeUndefined();
  });

  it('notifies its subscribers of a change', () => {
    const { access, summaries } = anOpenApp();
    const seen: unknown[] = [];
    summaries.subscribe((state) => seen.push(state.syncSummary));

    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(access));

    expect(seen).toEqual([{ synced: 1, rejected: 0 }]);
  });
});

describe('what the session left to tell', () => {
  it('is forgotten when the user locks the app, and when they sign out', () => {
    const { access, summaries } = anOpenApp();
    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(access));

    access.getState().locked(epochOf(access));
    expect(summaries.getState().syncSummary).toBeUndefined();

    access.getState().unlocked();
    summaries.getState().showSyncSummary({ synced: 2, rejected: 1 }, epochOf(access));
    access.getState().signedOut();
    expect(summaries.getState().syncSummary).toBeUndefined();
  });

  it.each([
    ['unauthorized'],
    [AUTHENTICATION_ERROR_CODE.NotAuthenticated],
    [AUTHENTICATION_ERROR_CODE.SessionExpired],
    [AUTHENTICATION_ERROR_CODE.SessionChanged],
    [AUTHENTICATION_ERROR_CODE.AppLocked],
  ] as const)('is forgotten when %s ends the session', (code) => {
    const { access, summaries } = anOpenApp();
    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epochOf(access));

    access.getState().endSession(code, epochOf(access));

    expect(summaries.getState().syncSummary).toBeUndefined();
  });

  it('drops a result of a run that started for the user who left, then somebody else signed in', () => {
    const { access, summaries } = anOpenApp();
    const first = epochOf(access);
    access.getState().signedOut();
    access.getState().signedIn();

    summaries.getState().showSyncSummary({ synced: 3, rejected: 1 }, first);

    expect(summaries.getState().syncSummary).toBeUndefined();
  });

  it('applies a result of the access it started under', () => {
    const { access, summaries } = anOpenApp();
    const epoch = epochOf(access);

    summaries.getState().showSyncSummary({ synced: 1, rejected: 0 }, epoch);

    expect(summaries.getState().syncSummary).toEqual({ synced: 1, rejected: 0 });
  });
});

const NONE = 'none';
const FIRST = 'a';

function Synced({ name }: { readonly name: string }) {
  const summary = useVoteSyncStore((state) => state.syncSummary);
  const text = `${name}: ${summary?.synced ?? NONE}`;
  return <Text>{text}</Text>;
}

describe('VoteSyncStoreProvider', () => {
  it('provides the store it is given, and re-renders the tree below when the state changes', () => {
    const { access, summaries } = anOpenApp();

    render(
      <VoteSyncStoreProvider store={summaries}>
        <Synced name={FIRST} />
      </VoteSyncStoreProvider>,
    );
    expect(screen.getByText('a: none')).toBeTruthy();

    act(() => {
      summaries.getState().showSyncSummary({ synced: 4, rejected: 0 }, epochOf(access));
    });

    expect(screen.getByText('a: 4')).toBeTruthy();
  });

  it('gives the store itself to code that reads it when an event fires, and refuses outside a provider', () => {
    const { summaries } = anOpenApp();
    const given: unknown[] = [];
    function Probe() {
      given.push(useVoteSyncStoreApi());
      return null;
    }
    render(
      <VoteSyncStoreProvider store={summaries}>
        <Probe />
      </VoteSyncStoreProvider>,
    );
    expect(given[0]).toBe(summaries);

    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('VoteSyncStoreProvider');
    expect(() => render(<Synced name={FIRST} />)).toThrow('VoteSyncStoreProvider');
    error.mockRestore();
  });
});
