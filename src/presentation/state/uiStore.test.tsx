import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import { SESSION_RESTORE } from '@application/use-cases/auth/RestoreSession';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { ACCESS, UiStoreProvider, createUiStore, useUiStore, useUiStoreApi } from './uiStore';

describe('createUiStore', () => {
  it('starts on the upcoming meetings', () => {
    expect(createUiStore().getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });

  it('selects a period', () => {
    const store = createUiStore();

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(store.getState().meetingsPeriod).toBe(MEETING_PERIOD.Past);
  });

  it('notifies its subscribers of a change', () => {
    const store = createUiStore();
    const periods: string[] = [];
    store.subscribe((state) => periods.push(state.meetingsPeriod));

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(periods).toEqual([MEETING_PERIOD.Past]);
  });

  it('creates a new store at every call: no state is shared between two', () => {
    const first = createUiStore();
    const second = createUiStore();

    first.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(second.getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });
});

describe('where the user stands', () => {
  it('starts before anything is known, and nothing is held about the session', () => {
    const state = createUiStore().getState();

    expect(state.access).toBe(ACCESS.Starting);
    expect(state.sessionEndedBy).toBeUndefined();
    expect(state.syncSummary).toBeUndefined();
    expect(state.privacyCover).toBe(false);
    expect(state.connectivity).toBe(CONNECTIVITY_STATUS.Online);
  });

  it('can start where a test of an open screen needs it', () => {
    expect(createUiStore({ access: ACCESS.Unlocked }).getState().access).toBe(ACCESS.Unlocked);
  });

  it('sends a start with nobody signed in to the sign-in screen', () => {
    const store = createUiStore();

    store.getState().sessionRestored(SESSION_RESTORE.None);

    expect(store.getState().access).toBe(ACCESS.SignedOut);
  });

  it('sends a restored session to the lock screen, never straight to the app', () => {
    const store = createUiStore();

    store.getState().sessionRestored(SESSION_RESTORE.UnlockRequired);

    expect(store.getState().access).toBe(ACCESS.Locked);
  });

  it('takes the answer of the restoration once: a late one cannot undo what the user did since', () => {
    const store = createUiStore({ access: ACCESS.Unlocked });

    store.getState().sessionRestored(SESSION_RESTORE.None);

    expect(store.getState().access).toBe(ACCESS.Unlocked);
  });

  it('opens on a sign-in and on an unlock, and forgets why the user had been sent away', () => {
    const store = createUiStore({ access: ACCESS.Unlocked });
    store.getState().endSession(AUTHENTICATION_ERROR_CODE.SessionExpired);
    expect(store.getState().sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.SessionExpired);

    store.getState().signedIn();
    expect(store.getState().access).toBe(ACCESS.Unlocked);
    expect(store.getState().sessionEndedBy).toBeUndefined();

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.AppLocked);
    store.getState().unlocked();
    expect(store.getState().access).toBe(ACCESS.Unlocked);
    expect(store.getState().sessionEndedBy).toBeUndefined();
  });

  it('locks, and signs out, forgetting what the session left to tell', () => {
    const store = createUiStore({ access: ACCESS.Unlocked });
    store.getState().showSyncSummary({ synced: 1, rejected: 0 });

    store.getState().locked();
    expect(store.getState().access).toBe(ACCESS.Locked);
    expect(store.getState().syncSummary).toBeUndefined();

    store.getState().unlocked();
    store.getState().showSyncSummary({ synced: 2, rejected: 1 });
    store.getState().signedOut();
    expect(store.getState().access).toBe(ACCESS.SignedOut);
    expect(store.getState().syncSummary).toBeUndefined();
    expect(store.getState().sessionEndedBy).toBeUndefined();
  });

  it.each([
    [REPOSITORY_ERROR_CODE.Unauthorized, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.NotAuthenticated, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.SessionExpired, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.SessionChanged, ACCESS.SignedOut],
    [AUTHENTICATION_ERROR_CODE.AppLocked, ACCESS.Locked],
  ] as const)('sends the user to the right screen when %s ends the session', (code, access) => {
    const store = createUiStore({ access: ACCESS.Unlocked });
    store.getState().showSyncSummary({ synced: 1, rejected: 0 });

    store.getState().endSession(code);

    expect(store.getState().access).toBe(access);
    expect(store.getState().sessionEndedBy).toBe(code);
    expect(store.getState().syncSummary).toBeUndefined();
  });

  it('ignores a failure that arrives after the user left the open app', () => {
    const store = createUiStore({ access: ACCESS.Unlocked });
    store.getState().signedOut();

    store.getState().endSession(AUTHENTICATION_ERROR_CODE.NotAuthenticated);

    expect(store.getState().sessionEndedBy).toBeUndefined();
    expect(store.getState().access).toBe(ACCESS.SignedOut);
  });

  it('keeps what it is told about the connection, the cover and the synchronisation', () => {
    const store = createUiStore({ access: ACCESS.Unlocked });

    store.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
    store.getState().setPrivacyCover(true);
    store.getState().showSyncSummary({ synced: 2, rejected: 1 });

    expect(store.getState().connectivity).toBe(CONNECTIVITY_STATUS.Offline);
    expect(store.getState().privacyCover).toBe(true);
    expect(store.getState().syncSummary).toEqual({ synced: 2, rejected: 1 });

    store.getState().dismissSyncSummary();
    expect(store.getState().syncSummary).toBeUndefined();
  });

  it('does not show a result of the synchronisation to a user who has left the open app', () => {
    const store = createUiStore({ access: ACCESS.Locked });

    store.getState().showSyncSummary({ synced: 1, rejected: 0 });

    expect(store.getState().syncSummary).toBeUndefined();
  });
});

const FIRST = 'a';
const SECOND = 'b';

function Period({ label }: { readonly label: string }) {
  const period = useUiStore((state) => state.meetingsPeriod);
  const select = useUiStore((state) => state.selectMeetingsPeriod);
  const text = `${label}: ${period}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        select(MEETING_PERIOD.Past);
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
}

describe('UiStoreProvider', () => {
  it('provides a store to the tree below, and re-renders it when the state changes', () => {
    render(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );
    expect(screen.getByText('a: upcoming')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
  });

  it('shares one store between the components below it', () => {
    render(
      <UiStoreProvider>
        <Period label={FIRST} />
        <Period label={SECOND} />
      </UiStoreProvider>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('b: past')).toBeTruthy();
  });

  it('provides the store it is given, so that what is outside React and what is inside see one', () => {
    const store = createUiStore();
    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    render(
      <UiStoreProvider store={store}>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );

    expect(screen.getByText('a: past')).toBeTruthy();
    act(() => {
      store.getState().selectMeetingsPeriod(MEETING_PERIOD.Upcoming);
    });
    expect(screen.getByText('a: upcoming')).toBeTruthy();
  });

  it('gives each provider its own store, so that two apps never share state', () => {
    render(
      <>
        <UiStoreProvider>
          <Period label={FIRST} />
        </UiStoreProvider>
        <UiStoreProvider>
          <Period label={SECOND} />
        </UiStoreProvider>
      </>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
    expect(screen.getByText('b: upcoming')).toBeTruthy();
  });

  it('keeps its store when the tree below it is rendered again', () => {
    const { rerender } = render(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );
    fireEvent.press(screen.getByLabelText(FIRST));

    rerender(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );

    expect(screen.getByText('a: past')).toBeTruthy();
    act(() => undefined);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree, not a state', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Period label={FIRST} />)).toThrow('UiStoreProvider');

    error.mockRestore();
  });

  it('gives the store itself to code that reads it when an event fires, and refuses outside a provider', () => {
    const store = createUiStore();
    const given: unknown[] = [];
    function Probe() {
      given.push(useUiStoreApi());
      return null;
    }
    render(
      <UiStoreProvider store={store}>
        <Probe />
      </UiStoreProvider>,
    );
    expect(given[0]).toBe(store);

    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow('UiStoreProvider');
    error.mockRestore();
  });
});
