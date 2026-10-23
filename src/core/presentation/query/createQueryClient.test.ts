import { QueryClient } from '@tanstack/react-query';

import { ERROR_CATALOG } from '@composition/shell/errorCatalog';
import { isSessionEndingCode } from '@features/auth/application/session/sessionPolicy';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@core/domain/errors/ValidationError';

import type { MeetingsErrorCode } from '@features/meetings/presentation/i18n/meetingMessageKeys';

import {
  QUERY_GC_TIME_MILLIS,
  QUERY_STALE_TIME_MILLIS,
  createQueryClient,
  discardSessionData,
} from './createQueryClient';
import { trackClient } from '../testing/queryClients';

import { QueryFailure } from './QueryFailure';
import { retryDelay } from './retryPolicy';

/** A client with the catalog of errors and the session policy of the app, which the composition hands over. */
const newClient = (options?: Partial<Parameters<typeof createQueryClient>[0]>): QueryClient =>
  trackClient(createQueryClient({ errorCatalog: ERROR_CATALOG, isSessionEndingCode, ...options }));

describe('createQueryClient', () => {
  it('creates a new client at every call: two apps never share a cache', () => {
    const first = newClient();
    const second = newClient();

    first.setQueryData(['key'], 'value');

    expect(first).not.toBe(second);
    expect(second.getQueryData(['key'])).toBeUndefined();
  });

  it('retries according to the error code, with the delay of the policy', () => {
    const { queries } = newClient().getDefaultOptions();

    const retry = queries?.retry;
    expect(typeof retry).toBe('function');
    if (typeof retry === 'function') {
      expect(retry(0, new QueryFailure({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }))).toBe(
        true,
      );
      expect(retry(0, new QueryFailure({ code: REPOSITORY_ERROR_CODE.Forbidden }))).toBe(false);
    }
    expect(queries?.retryDelay).toBe(retryDelay);
  });

  it('refetches nothing by itself: there is no window focus, and the screens refresh on demand', () => {
    const { queries } = newClient().getDefaultOptions();

    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.refetchOnReconnect).toBe(false);
  });

  it('lets a test choose the delay of the retries, and nothing else of the policy', () => {
    const delay = () => 0;
    const { queries } = newClient({ retryDelay: delay }).getDefaultOptions();

    expect(queries?.retryDelay).toBe(delay);
    expect(queries?.staleTime).toBe(QUERY_STALE_TIME_MILLIS);
    expect(queries?.gcTime).toBe(QUERY_GC_TIME_MILLIS);
  });

  describe('the cache policy', () => {
    it('keeps what a query holds current for a minute, so that coming back to a screen asks nothing', () => {
      const { queries } = newClient().getDefaultOptions();

      expect(queries?.staleTime).toBe(60_000);
    });

    it('drops what no screen uses any more after five minutes: the data is confidential', () => {
      const { queries } = newClient().getDefaultOptions();

      expect(queries?.gcTime).toBe(300_000);
    });

    it('keeps data longer than it counts as current, never the other way round', () => {
      expect(QUERY_GC_TIME_MILLIS).toBeGreaterThan(QUERY_STALE_TIME_MILLIS);
    });
  });
});

const SESSION_ENDING: MeetingsErrorCode[] = [
  REPOSITORY_ERROR_CODE.Unauthorized,
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
  AUTHENTICATION_ERROR_CODE.AppLocked,
];
const OTHERS: MeetingsErrorCode[] = [
  REPOSITORY_ERROR_CODE.NetworkUnavailable,
  REPOSITORY_ERROR_CODE.Forbidden,
  REPOSITORY_ERROR_CODE.NotFound,
  REPOSITORY_ERROR_CODE.Unexpected,
  STORAGE_ERROR_CODE.ReadFailed,
  VALIDATION_ERROR_CODE.Validation,
];

/** Runs a query that fails with `code` in a client whose cache holds other data. */
async function failWith(code: MeetingsErrorCode, endings: string[]) {
  const client = newClient({
    retryDelay: () => 0,
    onSessionEnded: (ended) => endings.push(ended),
  });
  client.setQueryData(['meetings', 'list'], 'the rows of the first user');
  await client
    .fetchQuery({
      queryKey: ['failing'],
      queryFn: () => Promise.reject(new QueryFailure({ code })),
    })
    .catch(() => undefined);
  return client;
}

describe('a failure that ends the session', () => {
  it.each(SESSION_ENDING)('empties the whole cache, whichever query failed: %s', async (code) => {
    const endings: string[] = [];

    const client = await failWith(code, endings);

    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(client.getQueryData(['meetings', 'list'])).toBeUndefined();
    expect(endings).toEqual([code]);
  });

  it.each(OTHERS)('leaves the cache alone for %s', async (code) => {
    const endings: string[] = [];

    const client = await failWith(code, endings);

    expect(client.getQueryData(['meetings', 'list'])).toBe('the rows of the first user');
    expect(endings).toEqual([]);
  });

  it('leaves the cache alone for a rejection that is not the failure of a use case', async () => {
    const client = newClient({ retryDelay: () => 0 });
    client.setQueryData(['kept'], 'value');

    await client
      .fetchQuery({ queryKey: ['failing'], queryFn: () => Promise.reject(new Error('boom')) })
      .catch(() => undefined);

    expect(client.getQueryData(['kept'])).toBe('value');
  });

  it('tells why before the cache is emptied', async () => {
    let held: unknown = 'not read';
    const client = newClient({
      onSessionEnded: () => {
        held = client.getQueryData(['kept']);
      },
    });
    client.setQueryData(['kept'], 'value');

    await client
      .fetchQuery({
        queryKey: ['failing'],
        queryFn: () =>
          Promise.reject(new QueryFailure({ code: REPOSITORY_ERROR_CODE.Unauthorized })),
      })
      .catch(() => undefined);

    expect(held).toBe('value');
    expect(client.getQueryData(['kept'])).toBeUndefined();
  });
});

describe('a failure that says the item is refused or gone', () => {
  const REFUSALS = [REPOSITORY_ERROR_CODE.Forbidden, REPOSITORY_ERROR_CODE.NotFound] as const;

  /** A query that holds a meeting, then fails to refresh it with this error. */
  async function refreshFails(code: string) {
    const client = newClient({ retryDelay: () => 0 });
    client.setQueryData(['meetings', 'detail', 'm1'], 'the meeting');
    client.setQueryData(['meetings', 'detail', 'm2'], 'another meeting');
    await client
      .fetchQuery({
        queryKey: ['meetings', 'detail', 'm1'],
        staleTime: 0,
        queryFn: () => Promise.reject(new QueryFailure({ code })),
      })
      .catch(() => undefined);
    return client;
  }

  it.each(REFUSALS)(
    'drops the data of that query when it is %s, and keeps its error',
    async (code) => {
      const client = await refreshFails(code);

      const state = client.getQueryState(['meetings', 'detail', 'm1']);
      expect(client.getQueryData(['meetings', 'detail', 'm1'])).toBeUndefined();
      expect(state?.data).toBeUndefined();
      expect(state?.dataUpdatedAt).toBe(0);
      expect(state?.error).toBeInstanceOf(QueryFailure);
      expect(state?.status).toBe('error');
    },
  );

  it.each(REFUSALS)('leaves the other queries alone when it is %s', async (code) => {
    const client = await refreshFails(code);

    expect(client.getQueryData(['meetings', 'detail', 'm2'])).toBe('another meeting');
  });

  it.each([REPOSITORY_ERROR_CODE.Unexpected, REPOSITORY_ERROR_CODE.NetworkUnavailable])(
    'keeps the data next to the error when it is %s: the item may well be there',
    async (code) => {
      const client = await refreshFails(code);

      expect(client.getQueryData(['meetings', 'detail', 'm1'])).toBe('the meeting');
    },
  );

  it('does not end the session: it concerns one item', async () => {
    const endings: unknown[] = [];
    const client = newClient({
      retryDelay: () => 0,
      onSessionEnded: (code) => endings.push(code),
    });

    await client
      .fetchQuery({
        queryKey: ['meetings', 'detail', 'm1'],
        queryFn: () => Promise.reject(new QueryFailure({ code: REPOSITORY_ERROR_CODE.NotFound })),
      })
      .catch(() => undefined);

    expect(endings).toEqual([]);
  });
});

describe('a failure that ends the session, and the access it started under', () => {
  it('says which access a mutation started under, which a query does not', async () => {
    const told: (number | undefined)[] = [];
    const client = newClient({
      retryDelay: () => 0,
      onSessionEnded: (_code, startedUnder) => told.push(startedUnder),
    });
    const failure = (startedUnder?: number) =>
      new QueryFailure({ code: REPOSITORY_ERROR_CODE.Unauthorized }, startedUnder);

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(failure(4)) })
      .execute(undefined)
      .catch(() => undefined);
    await client
      .fetchQuery({ queryKey: ['failing'], queryFn: () => Promise.reject(failure()) })
      .catch(() => undefined);

    expect(told).toEqual([4, undefined]);
  });
});

describe('discardSessionData', () => {
  it('empties the cache of a client: what a sign-out calls', () => {
    const client = new QueryClient();
    client.setQueryData(['a'], 1);
    client.setQueryData(['b'], 2);

    discardSessionData(client);

    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});

describe('createQueryClient, mutations', () => {
  it('never retries a mutation: an action is repeated by the user, not by the library', () => {
    const { mutations } = newClient().getDefaultOptions();

    expect(mutations?.retry).toBe(false);
    expect(mutations?.networkMode).toBe('always');
  });

  it('drops a mutation as soon as nothing observes it: its result may hold the choice of a vote', async () => {
    const client = newClient();

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.resolve('a vote') })
      .execute(undefined);
    await Promise.resolve();

    expect(client.getDefaultOptions().mutations?.gcTime).toBe(0);
  });

  it.each([
    REPOSITORY_ERROR_CODE.Unauthorized,
    AUTHENTICATION_ERROR_CODE.NotAuthenticated,
    AUTHENTICATION_ERROR_CODE.SessionExpired,
    AUTHENTICATION_ERROR_CODE.SessionChanged,
    AUTHENTICATION_ERROR_CODE.AppLocked,
  ])('ends the session, as a query does, when a mutation fails with %s', async (code) => {
    const ended: string[] = [];
    const client = newClient({ onSessionEnded: (reason) => ended.push(reason) });
    client.setQueryData(['rows'], 'the rows of the user');

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new QueryFailure({ code })) })
      .execute(undefined)
      .catch(() => undefined);
    await Promise.resolve();

    expect(ended).toEqual([code]);
    expect(client.getQueryCache().getAll()).toEqual([]);
  });

  it.each([
    REPOSITORY_ERROR_CODE.NotFound,
    REPOSITORY_ERROR_CODE.NetworkUnavailable,
    'biometricCancelled',
    'alreadyVoted',
  ])('does not end the session when a mutation fails with %s', async (code) => {
    const ended: string[] = [];
    const client = newClient({ onSessionEnded: (reason) => ended.push(reason) });
    client.setQueryData(['rows'], 'the rows of the user');

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new QueryFailure({ code })) })
      .execute(undefined)
      .catch(() => undefined);
    await Promise.resolve();

    expect(ended).toEqual([]);
    expect(client.getQueryData(['rows'])).toBe('the rows of the user');
  });

  it('does not end the session when a mutation rejects with something that is not the failure of a use case', async () => {
    const ended: string[] = [];
    const client = newClient({ onSessionEnded: (reason) => ended.push(reason) });

    await client
      .getMutationCache()
      .build(client, { mutationFn: () => Promise.reject(new Error('boom')) })
      .execute(undefined)
      .catch(() => undefined);

    expect(ended).toEqual([]);
  });
});
