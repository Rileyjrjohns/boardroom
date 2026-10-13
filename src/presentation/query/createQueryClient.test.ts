import { QueryClient } from '@tanstack/react-query';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { VALIDATION_ERROR_CODE } from '@domain/errors/ValidationError';

import type { MeetingsErrorCode } from '../i18n/translationKeys';

import {
  QUERY_GC_TIME_MILLIS,
  QUERY_STALE_TIME_MILLIS,
  createQueryClient,
  discardSessionData,
  isSessionEndingCode,
} from './createQueryClient';
import { trackClient } from '../testing/queryClients';

import { QueryFailure } from './QueryFailure';
import { retryDelay, shouldRetry } from './retryPolicy';

const newClient = (options?: Parameters<typeof createQueryClient>[0]): QueryClient =>
  trackClient(createQueryClient(options));

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

    expect(queries?.retry).toBe(shouldRetry);
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
async function failWith(code: MeetingsErrorCode, endings: MeetingsErrorCode[]) {
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
  it.each(SESSION_ENDING)('is recognised for %s', (code) => {
    expect(isSessionEndingCode(code)).toBe(true);
  });

  it.each(OTHERS)('is not recognised for %s: it concerns one request, not the session', (code) => {
    expect(isSessionEndingCode(code)).toBe(false);
  });

  it.each(SESSION_ENDING)('empties the whole cache, whichever query failed: %s', async (code) => {
    const endings: MeetingsErrorCode[] = [];

    const client = await failWith(code, endings);

    expect(client.getQueryCache().getAll()).toEqual([]);
    expect(client.getQueryData(['meetings', 'list'])).toBeUndefined();
    expect(endings).toEqual([code]);
  });

  it.each(OTHERS)('leaves the cache alone for %s', async (code) => {
    const endings: MeetingsErrorCode[] = [];

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

describe('discardSessionData', () => {
  it('empties the cache of a client: what a sign-out calls', () => {
    const client = new QueryClient();
    client.setQueryData(['a'], 1);
    client.setQueryData(['b'], 2);

    discardSessionData(client);

    expect(client.getQueryCache().getAll()).toEqual([]);
  });
});
