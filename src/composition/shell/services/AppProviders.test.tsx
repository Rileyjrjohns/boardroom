import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { QueryFailure } from '@core/presentation/query/QueryFailure';
import { trackClient } from '@core/presentation/testing/queryClients';
import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { useMeetingsStore } from '@features/meetings/presentation/state/meetingsStore';
import { unusedServices } from '@testing/presentation/unusedServices';

import { AppProviders, createAppState } from './AppProviders';
import { useAppServices } from './AppServices';
import type { AppState } from './AppProviders';
import type { AppServices } from './AppServices';

const SERVICES: AppServices = unusedServices(12);

const clients: unknown[] = [];

/** Reads the three things the providers give, and records the query client it got. */
function Probe({ name }: { readonly name: string }) {
  const { settings } = useAppServices();
  const client = useQueryClient();
  const period = useMeetingsStore((state) => state.meetingsPeriod);
  const select = useMeetingsStore((state) => state.selectMeetingsPeriod);
  clients.push(client);
  const text = `${name}: ${settings.meetingsPageSize} ${period}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => {
        select(MEETING_PERIOD.Past);
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
}

beforeEach(() => {
  clients.length = 0;
});

describe('AppProviders', () => {
  it('provides the services, a query client and the interface store to the tree', () => {
    render(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    expect(screen.getByText('a: 12 upcoming')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a'));
    expect(screen.getByText('a: 12 past')).toBeTruthy();
  });

  it('keeps the same query client when it is rendered again', () => {
    const { rerender } = render(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    rerender(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    expect(new Set(clients).size).toBe(1);
  });

  it('gives each instance of the app its own query client and its own store', () => {
    render(
      <>
        <AppProviders services={SERVICES}>
          <Probe name="a" />
        </AppProviders>
        <AppProviders services={SERVICES}>
          <Probe name="b" />
        </AppProviders>
      </>,
    );

    fireEvent.press(screen.getByLabelText('a'));

    expect(new Set(clients).size).toBe(2);
    expect(screen.getByText('b: 12 upcoming')).toBeTruthy();
  });
});

describe('createAppState', () => {
  it('creates a new client and a new store at every call', () => {
    const first = createAppState();
    const second = createAppState();
    trackClient(first.queryClient);
    trackClient(second.queryClient);

    expect(first.queryClient).not.toBe(second.queryClient);
    expect(first.uiStore).not.toBe(second.uiStore);
    expect(first.accessStore).not.toBe(second.accessStore);
    expect(first.meetingsStore).not.toBe(second.meetingsStore);
    expect(first.voteSyncStore).not.toBe(second.voteSyncStore);
  });

  it('has the store told why when a failure ends the session, and the cache emptied', async () => {
    const { queryClient, accessStore } = createAppState({
      retryDelay: () => 0,
      access: ACCESS.Unlocked,
    });
    trackClient(queryClient);
    queryClient.setQueryData(['rows'], 'the rows of the user');
    expect(accessStore.getState().sessionEndedBy).toBeUndefined();

    await queryClient
      .fetchQuery({
        queryKey: ['failing'],
        queryFn: () =>
          Promise.reject(new QueryFailure({ code: REPOSITORY_ERROR_CODE.Unauthorized })),
      })
      .catch(() => undefined);

    expect(accessStore.getState().sessionEndedBy).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
    expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
    expect(queryClient.getQueryCache().getAll()).toEqual([]);
  });

  it('does the same when a mutation is the one that meets the end of the session', async () => {
    const { queryClient, accessStore } = createAppState({ access: ACCESS.Unlocked });
    trackClient(queryClient);
    queryClient.setQueryData(['rows'], 'the rows of the user');

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () =>
          Promise.reject(new QueryFailure({ code: AUTHENTICATION_ERROR_CODE.AppLocked })),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(accessStore.getState().access).toBe(ACCESS.Locked);
    expect(accessStore.getState().sessionEndedBy).toBe(AUTHENTICATION_ERROR_CODE.AppLocked);
    await waitFor(() => {
      expect(queryClient.getQueryCache().getAll()).toEqual([]);
    });
  });

  it.each([
    ['signs out', (store: AppState['accessStore']) => store.getState().signedOut()],
    [
      'locks',
      (store: AppState['accessStore']) => store.getState().locked(store.getState().accessEpoch),
    ],
  ])('empties the cache, queries and mutations, when the user %s', (_action, leave) => {
    const { queryClient, accessStore } = createAppState({ access: ACCESS.Unlocked });
    trackClient(queryClient);
    queryClient.setQueryData(['rows'], 'the rows of the user');
    void queryClient.getMutationCache().build(queryClient, { mutationFn: () => Promise.resolve() });

    leave(accessStore);

    expect(queryClient.getQueryCache().getAll()).toEqual([]);
    expect(queryClient.getMutationCache().getAll()).toEqual([]);
  });

  it('ignores the failure of an action that a user who left had started, for the user who came after', async () => {
    const { queryClient, accessStore } = createAppState({ access: ACCESS.Unlocked });
    trackClient(queryClient);
    const first = accessStore.getState().accessEpoch;
    accessStore.getState().signedOut();
    accessStore.getState().signedIn();

    await queryClient
      .getMutationCache()
      .build(queryClient, {
        mutationFn: () =>
          Promise.reject(
            new QueryFailure({ code: AUTHENTICATION_ERROR_CODE.SessionChanged }, first),
          ),
      })
      .execute(undefined)
      .catch(() => undefined);

    expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(accessStore.getState().sessionEndedBy).toBeUndefined();
  });

  it('does not let a query that was removed from the cache end the session of the next user', async () => {
    const { queryClient, accessStore } = createAppState({ access: ACCESS.Unlocked });
    trackClient(queryClient);
    let refuse: () => void = () => undefined;
    const pending = queryClient
      .fetchQuery({
        queryKey: ['meetings', 'list'],
        queryFn: () =>
          new Promise((_resolve, reject) => {
            refuse = () => {
              reject(new QueryFailure({ code: AUTHENTICATION_ERROR_CODE.SessionChanged }));
            };
          }),
      })
      .catch(() => undefined);
    accessStore.getState().signedOut();
    accessStore.getState().signedIn();

    refuse();
    await pending;

    expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
    expect(accessStore.getState().sessionEndedBy).toBeUndefined();
  });

  it('keeps the cache while the user goes from one screen of the open app to another', () => {
    const { queryClient, accessStore, uiStore } = createAppState({ access: ACCESS.Locked });
    trackClient(queryClient);
    queryClient.setQueryData(['rows'], 'the rows of the user');

    accessStore.getState().unlocked();
    uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);

    expect(queryClient.getQueryData(['rows'])).toBe('the rows of the user');
  });

  it('leaves the store alone for a failure that does not end the session', async () => {
    const { queryClient, accessStore } = createAppState({ retryDelay: () => 0 });
    trackClient(queryClient);

    await queryClient
      .fetchQuery({
        queryKey: ['failing'],
        queryFn: () => Promise.reject(new QueryFailure({ code: REPOSITORY_ERROR_CODE.NotFound })),
      })
      .catch(() => undefined);

    expect(accessStore.getState().sessionEndedBy).toBeUndefined();
  });

  it('is the state AppProviders uses when it is given one', () => {
    const state = createAppState();
    trackClient(state.queryClient);

    render(
      <AppProviders services={SERVICES} state={state}>
        <Probe name="a" />
      </AppProviders>,
    );

    expect(clients).toEqual([state.queryClient]);
  });
});
