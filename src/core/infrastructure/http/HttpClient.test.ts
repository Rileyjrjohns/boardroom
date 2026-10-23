import { z } from 'zod';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { aDuration, aUserId } from '@testing/domain/builders';
import { createHttpWorld, installMockApi, TEST_API_URL } from '@testing/infrastructure/httpWorld';

import { HTTP_FAILURE_CODE, HttpClient } from './HttpClient';
import type {
  BearerToken,
  BearerTokenSource,
  FetchFunction,
  FetchRequestInit,
  FetchedResponse,
} from './HttpClient';
import { HTTP_RESOURCE } from './invalidResponse';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS, MAX_RESPONSE_BYTES } from './protocol';

const BASE_URL = 'https://api.boardroom.example/v1';
const TOKEN = 'a-very-secret-token';

/** What a request was sent as. */
interface Sent {
  readonly url: string;
  readonly init: FetchRequestInit;
}

type Answer = { status: number; body?: string } | Error | 'never' | 'broken body';

/** A `fetch` that answers what the test scripted, one answer per request, and remembers the requests. */
function scriptedFetch(...answers: Answer[]) {
  const sent: Sent[] = [];
  const fetch: FetchFunction = (url, init) => {
    sent.push({ url, init });
    const answer = answers[Math.min(sent.length, answers.length) - 1] ?? { status: 200 };
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer === 'never') {
      return new Promise<FetchedResponse>(() => undefined);
    }
    if (answer === 'broken body') {
      return Promise.resolve({
        status: 200,
        text: () => Promise.reject(new Error('connection reset')),
      });
    }
    return Promise.resolve({
      status: answer.status,
      text: () => Promise.resolve(answer.body ?? ''),
    });
  };
  return { fetch, sent };
}

const USER = aUserId('user-1');

/** The token of the signed-in user, which says whose it is. */
const signedInAs = (userId = USER, token = TOKEN) => ok({ token, userId });

function aClient(
  fetch: FetchFunction,
  options: {
    token?: Result<BearerToken | undefined, ReturnType<typeof storageReadFailed>>;
    timeout?: number;
  } = {},
) {
  const monitoring = new FakeMonitoring();
  const tokenCalls = { count: 0 };
  const tokens: BearerTokenSource = {
    token: () => {
      tokenCalls.count += 1;
      return Promise.resolve(options.token ?? signedInAs());
    },
  };
  const client = new HttpClient({
    baseUrl: BASE_URL,
    timeout: aDuration(options.timeout ?? 1000),
    tokens,
    monitoring,
    fetch,
  });
  return { client, monitoring, tokenCalls };
}

const itemSchema = z.object({ id: z.string(), count: z.number() });

const get = (path = '/items') => ({
  method: HTTP_METHOD.Get,
  path,
  resource: HTTP_RESOURCE.Meeting,
  schema: itemSchema,
});

describe('HttpClient, the request', () => {
  it('sends a GET to the base URL and the path with the token of the user, asking for JSON', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
    const { client } = aClient(fetch);

    await client.request(get('/items/a'));

    expect(sent).toHaveLength(1);
    expect(sent[0]?.url).toBe(`${BASE_URL}/items/a`);
    expect(sent[0]?.init.method).toBe('GET');
    expect(sent[0]?.init.headers).toEqual({
      [HTTP_HEADER.Accept]: 'application/json',
      [HTTP_HEADER.CacheControl]: 'no-store',
      [HTTP_HEADER.Authorization]: `Bearer ${TOKEN}`,
    });
    expect(sent[0]?.init.body).toBeUndefined();
    expect(sent[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it('puts the query after the path, every name and value percent-encoded, and leaves out what is undefined', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
    const { client } = aClient(fetch);

    await client.request({
      ...get(),
      query: { period: 'past', limit: 10, cursor: 'a b&c=d/é', skipped: undefined },
    });

    expect(sent[0]?.url).toBe(
      `${BASE_URL}/items?period=past&limit=10&cursor=a%20b%26c%3Dd%2F%C3%A9`,
    );
  });

  it('sends no query mark for an empty query', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch);

    await client.request({ ...get(), query: { nothing: undefined } });

    expect(sent[0]?.url).toBe(`${BASE_URL}/items`);
  });

  it('sends a body as JSON with its content type, next to the headers the caller adds', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
    const { client } = aClient(fetch);

    await client.request({
      ...get('/votes'),
      method: HTTP_METHOD.Post,
      body: { choice: 'for', nested: { n: 1 } },
      headers: { [HTTP_HEADER.IdempotencyKey]: '12.r.u' },
    });

    expect(sent[0]?.init.method).toBe('POST');
    expect(sent[0]?.init.body).toBe('{"choice":"for","nested":{"n":1}}');
    expect(sent[0]?.init.headers).toEqual({
      [HTTP_HEADER.Accept]: 'application/json',
      [HTTP_HEADER.CacheControl]: 'no-store',
      [HTTP_HEADER.Authorization]: `Bearer ${TOKEN}`,
      [HTTP_HEADER.ContentType]: 'application/json',
      [HTTP_HEADER.IdempotencyKey]: '12.r.u',
    });
  });

  it('carries no token, and does not ask for one, when the request is not authenticated', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client, tokenCalls } = aClient(fetch);

    await client.request({ ...get('/auth/sign-in'), authenticated: false });

    expect(sent[0]?.init.headers).not.toHaveProperty(HTTP_HEADER.Authorization);
    expect(tokenCalls.count).toBe(0);
  });

  it('is unauthorized, without sending anything, when nobody is signed in', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch, { token: ok(undefined) });

    expect(await client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unauthorized }),
    );
    expect(sent).toEqual([]);
  });

  it('is unexpected, not unauthorized, and sends nothing, when the token cannot be read', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch, { token: err(storageReadFailed()) });

    expect(await client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'credentials unreadable' }),
    );
    expect(sent).toEqual([]);
  });

  it('attaches the token read when the request was created, not one that arrives while it is on its way', async () => {
    let current = 'token-of-alice';
    const sent: Sent[] = [];
    let respond: (response: FetchedResponse) => void = () => undefined;
    const fetch: FetchFunction = (url, init) => {
      sent.push({ url, init });
      return new Promise<FetchedResponse>((resolve) => {
        respond = resolve;
      });
    };
    const client = new HttpClient({
      baseUrl: BASE_URL,
      timeout: aDuration(1000),
      tokens: { token: () => Promise.resolve(signedInAs(USER, current)) },
      monitoring: new FakeMonitoring(),
      fetch,
    });

    const pending = client.request(get());
    await new Promise((resolve) => setImmediate(resolve));
    current = 'token-of-bruno';
    respond({ status: 200, text: () => Promise.resolve('{"id":"a","count":1}') });
    await pending;

    expect(sent[0]?.init.headers[HTTP_HEADER.Authorization]).toBe('Bearer token-of-alice');
  });

  it('answers unexpected, and sends nothing, for a body that has no JSON form', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch);

    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      await client.request({ ...get(), method: HTTP_METHOD.Post, body: circular }),
    ).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'request could not be built' }),
    );
    expect(
      await client.request({ ...get(), method: HTTP_METHOD.Post, body: { n: BigInt(1) } }),
    ).toMatchObject({ ok: false });
    expect(sent).toEqual([]);
  });
});

describe('HttpClient, the answer', () => {
  it('gives the body of a success, read through the schema', async () => {
    const { fetch } = scriptedFetch({ status: 200, body: '{"id":"a","count":3,"ignored":true}' });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(ok({ id: 'a', count: 3 }));
  });

  it.each([200, 201, 202, 299])('reads a body from a success with status %s', async (status) => {
    const { fetch } = scriptedFetch({ status, body: '{"id":"a","count":3}' });

    expect((await aClient(fetch).client.request(get())).ok).toBe(true);
  });

  it('reads an empty body as undefined, for the schema of a call that returns nothing', async () => {
    const { fetch } = scriptedFetch({ status: HTTP_STATUS.NoContent });
    const { client } = aClient(fetch);

    expect(await client.request({ ...get(), schema: z.undefined() })).toStrictEqual(ok(undefined));
  });

  it.each([200, 201, 204, 299])('takes the status %s for a success', async (status) => {
    const { fetch } = scriptedFetch({ status, body: '{"id":"a","count":1}' });

    expect((await aClient(fetch).client.request(get())).ok).toBe(true);
  });

  it.each([
    [HTTP_STATUS.Unauthorized, REPOSITORY_ERROR_CODE.Unauthorized],
    [HTTP_STATUS.Forbidden, REPOSITORY_ERROR_CODE.Forbidden],
    [HTTP_STATUS.NotFound, REPOSITORY_ERROR_CODE.NotFound],
    [HTTP_STATUS.BadGateway, REPOSITORY_ERROR_CODE.NetworkUnavailable],
    [HTTP_STATUS.ServiceUnavailable, REPOSITORY_ERROR_CODE.NetworkUnavailable],
    [HTTP_STATUS.GatewayTimeout, REPOSITORY_ERROR_CODE.NetworkUnavailable],
  ])('turns the status %s into %s', async (status, code) => {
    const { fetch } = scriptedFetch({ status, body: '{"error":{"code":"whatever"}}' });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(err({ code }));
  });

  it.each([400, 405, 409, 418, 500, 501, 300, 301, 304, 199, 100])(
    'turns the status %s into unexpected, with the status as the only cause',
    async (status) => {
      const { fetch } = scriptedFetch({ status, body: 'secret-looking text' });

      expect(await aClient(fetch).client.request(get())).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: `status ${status}` }),
      );
    },
  );

  describe('a business rejection, status 422', () => {
    it('gives the description the server sent, for the caller to read', async () => {
      const { fetch } = scriptedFetch({
        status: HTTP_STATUS.UnprocessableContent,
        body: '{"error":{"code":"resolutionClosed"}}',
      });

      expect(await aClient(fetch).client.request(get())).toStrictEqual(
        err({ code: HTTP_FAILURE_CODE.RequestRejected, error: { code: 'resolutionClosed' } }),
      );
    });

    it.each([
      ['a body that is not JSON', 'oops'],
      ['an empty body', ''],
      ['JSON without an error', '{"message":"no"}'],
      ['JSON that is not an object', '12'],
      ['JSON that is null', 'null'],
    ])('is unexpected, with the status, for %s', async (_name, body) => {
      const { fetch } = scriptedFetch({ status: HTTP_STATUS.UnprocessableContent, body });

      expect(await aClient(fetch).client.request(get())).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 422' }),
      );
    });
  });

  describe('a success that does not have the shape of the API', () => {
    it.each([
      ['text that is not JSON', 'not json', '$'],
      ['an empty body', '', '$'],
      ['JSON of another type', '[]', '$'],
      ['a missing field', '{"id":"a"}', 'count'],
      ['a mistyped field', '{"id":"a","count":"3"}', 'count'],
      ['several flaws, listed once each, sorted', '{"id":1,"count":"x"}', 'count,id'],
    ])(
      'is unexpected for %s, and reports where it broke the schema',
      async (_name, body, paths) => {
        const { fetch } = scriptedFetch({ status: 200, body });
        const { client, monitoring } = aClient(fetch);

        expect(await client.request(get())).toStrictEqual(
          err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' }),
        );

        expect(monitoring.errors).toEqual([
          {
            event: MONITORING_EVENT.ResponseInvalid,
            error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' },
            attributes: {
              [LOG_ATTRIBUTE.Resource]: HTTP_RESOURCE.Meeting,
              [LOG_ATTRIBUTE.IssuePaths]: paths,
            },
          },
        ]);
      },
    );

    it('reports the position in a list and the path of a nested field, never the values', async () => {
      const { fetch } = scriptedFetch({
        status: 200,
        body: '{"rows":[{"inner":{"n":"SECRET-VALUE"}},{"inner":{"n":1}}]}',
      });
      const { client, monitoring } = aClient(fetch);

      await client.request({
        ...get(),
        schema: z.object({ rows: z.array(z.object({ inner: z.object({ n: z.number() }) })) }),
      });

      expect(monitoring.errors[0]?.attributes?.[LOG_ATTRIBUTE.IssuePaths]).toBe('rows.0.inner.n');
      expect(JSON.stringify(monitoring.errors)).not.toContain('SECRET-VALUE');
    });
  });
});

describe('HttpClient, when the network fails', () => {
  it('is networkUnavailable when the request cannot be made', async () => {
    const { fetch } = scriptedFetch(new TypeError('Network request failed'));

    expect(await aClient(fetch).client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });

  it('is networkUnavailable when the answer is cut off while it is being read', async () => {
    const { fetch } = scriptedFetch('broken body');

    expect(await aClient(fetch).client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });

  it('is networkUnavailable, and aborts the request, when the answer takes longer than the timeout', async () => {
    const { fetch, sent } = scriptedFetch('never');
    const { client } = aClient(fetch, { timeout: 30 });

    const started = Date.now();
    const answer = await client.request(get());

    expect(answer).toStrictEqual(err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }));
    expect(Date.now() - started).toBeLessThan(1000);
    expect(sent[0]?.init.signal.aborted).toBe(true);
  });

  it('settles within the timeout even when the platform ignores the abort', async () => {
    // `fetch` never settles, abort or not: the answer must not depend on it.
    const { fetch } = scriptedFetch('never');
    const { client } = aClient(fetch, { timeout: 20 });

    const started = Date.now();
    await expect(client.request(get())).resolves.toMatchObject({ ok: false });

    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('waits for the timeout it was given, and not for less: a slow answer inside it is an answer', async () => {
    const slow: FetchFunction = () =>
      new Promise((resolve) => {
        setTimeout(() => {
          resolve({ status: 200, text: () => Promise.resolve('{"id":"a","count":1}') });
        }, 60);
      });
    const { client } = aClient(slow, { timeout: 2000 });

    const answer = await client.request(get());

    expect(answer.ok).toBe(true);
  });

  it('does not leave its timer running once the answer is in', async () => {
    jest.useFakeTimers();
    try {
      const { fetch } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
      const { client } = aClient(fetch, { timeout: 5000 });

      await client.request(get());

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not leave its timer running after a failure either', async () => {
    jest.useFakeTimers();
    try {
      const { fetch } = scriptedFetch(new TypeError('offline'));
      const { client } = aClient(fetch, { timeout: 5000 });

      await client.request(get());

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('HttpClient, whatever goes wrong', () => {
  const failures: [string, Answer][] = [
    [
      'a network error',
      new TypeError('failed to fetch https://api.boardroom.example/v1/items?q=secret'),
    ],
    ['a status', { status: 500, body: `{"detail":"${TOKEN} /var/secret/path"}` }],
    ['a rejection that cannot be read', { status: 422, body: 'user alice@example.com' }],
    ['a body that is not JSON', { status: 200, body: `leak ${TOKEN}` }],
    [
      'a body of the wrong shape',
      { status: 200, body: `{"id":"${TOKEN}","count":"alice@example.com"}` },
    ],
  ];

  it.each(failures)(
    'puts no URL, path, token, email or body in the error for %s',
    async (_name, answer) => {
      const { fetch } = scriptedFetch(answer);
      const { client, monitoring } = aClient(fetch);

      const result = await client.request(get('/items/secret-id?q=secret'));

      const reported = JSON.stringify([result, monitoring.logs, monitoring.errors]);
      for (const secret of [
        'api.boardroom.example',
        'secret-id',
        'q=secret',
        TOKEN,
        'alice@example.com',
        '/var/secret',
      ]) {
        expect(reported).not.toContain(secret);
      }
    },
  );

  it('never rejects: a function that throws instead of returning a promise is a network failure too', async () => {
    const { client } = aClient(() => {
      throw new Error('synchronous');
    });

    expect(await client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });
});

// The same client over the real `fetch` of Node, through MSW: what the scripted fetch above cannot
// say, namely that a connection that fails, a server that never answers and a request that is
// aborted are what the platform really does.
describe('HttpClient, over the global fetch and MSW', () => {
  const installed = installMockApi();

  async function aWorldClient(timeout = 2000) {
    const world = await createHttpWorld(installed, { client: { timeout: aDuration(timeout) } });
    await world.signInAs(aUserId('user-1'));
    return world;
  }

  it('reaches the server through the global fetch, with the token of the signed-in user', async () => {
    const world = await aWorldClient();

    const listed = await world.meetings.list('upcoming', { limit: 5 });

    expect(listed.ok).toBe(true);
    expect(installed.received).toContainEqual(
      expect.stringContaining(`GET ${TEST_API_URL}/meetings?`),
    );
  });

  it('is networkUnavailable when the connection fails', async () => {
    const world = await aWorldClient();
    installed.conditions.online = false;

    expect(await world.meetings.list('upcoming', { limit: 5 })).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });

  it('is networkUnavailable, within the timeout, when the server never answers', async () => {
    const world = await aWorldClient(50);
    installed.conditions.delayMillis = 'infinite';

    const started = Date.now();
    const answer = await world.meetings.list('upcoming', { limit: 5 });

    expect(answer).toStrictEqual(err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('is networkUnavailable when the simulated server is unreachable and answers 503', async () => {
    const world = await aWorldClient();
    world.network.setOnline(false);

    expect(await world.meetings.list('upcoming', { limit: 5 })).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });
});

describe('HttpClient, a request that cannot be built', () => {
  const ILL_FORMED = '\ud800';

  it('answers unexpected, and sends nothing, when the path cannot be built', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch);

    const answer = await client.request(() => ({
      ...get(),
      path: `/items/${encodeURIComponent(ILL_FORMED)}`,
    }));

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'request could not be built' }),
    );
    expect(sent).toEqual([]);
  });

  it('answers unexpected, and sends nothing, when the query cannot be encoded', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch);

    const answer = await client.request({ ...get(), query: { cursor: ILL_FORMED } });

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'request could not be built' }),
    );
    expect(sent).toEqual([]);
  });

  it('answers unexpected, and sends nothing, when a header cannot be built', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch);

    const answer = await client.request(() => ({
      ...get(),
      headers: { [HTTP_HEADER.IdempotencyKey]: encodeURIComponent(ILL_FORMED) },
    }));

    expect(answer).toMatchObject({ ok: false, error: { cause: 'request could not be built' } });
    expect(sent).toEqual([]);
  });

  it('leaks nothing of what could not be encoded', async () => {
    const { fetch } = scriptedFetch();
    const { client, monitoring } = aClient(fetch);

    const answer = await client.request(() => {
      throw new URIError(`malformed ${TOKEN} https://api.boardroom.example/secret`);
    });

    const reported = JSON.stringify([answer, monitoring.errors, monitoring.logs]);
    expect(reported).not.toContain(TOKEN);
    expect(reported).not.toContain('api.boardroom.example');
  });
});

describe('HttpClient, a request made for a user', () => {
  it('is sent when the token is the one of that user', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
    const { client } = aClient(fetch);

    const answer = await client.request({ ...get(), forUser: USER });

    expect(answer.ok).toBe(true);
    expect(sent).toHaveLength(1);
  });

  it('is unauthorized, without being sent, when the token is the one of another user', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch, { token: signedInAs(aUserId('user-2'), 'token-of-bruno') });

    const answer = await client.request({ ...get(), forUser: USER });

    expect(answer).toStrictEqual(err({ code: REPOSITORY_ERROR_CODE.Unauthorized }));
    expect(sent).toEqual([]);
  });

  it('decides on the token and the user it reads together, not on two reads', async () => {
    // The user who is signed in changes at once after the token is read: the request already
    // carries the token of the first, and it is for the first. Only a pair read in one go can say so.
    let current = signedInAs(USER, 'token-of-alice');
    const sent: Sent[] = [];
    const client = new HttpClient({
      baseUrl: BASE_URL,
      timeout: aDuration(1000),
      tokens: {
        token: () => {
          const read = current;
          current = signedInAs(aUserId('user-2'), 'token-of-bruno');
          return Promise.resolve(read);
        },
      },
      monitoring: new FakeMonitoring(),
      fetch: (url, init) => {
        sent.push({ url, init });
        return Promise.resolve({
          status: 200,
          text: () => Promise.resolve('{"id":"a","count":1}'),
        });
      },
    });

    const answer = await client.request({ ...get(), forUser: USER });

    expect(answer.ok).toBe(true);
    expect(sent[0]?.init.headers[HTTP_HEADER.Authorization]).toBe('Bearer token-of-alice');
  });

  it('is unauthorized, without being sent, when nobody is signed in', async () => {
    const { fetch, sent } = scriptedFetch();
    const { client } = aClient(fetch, { token: ok(undefined) });

    expect(await client.request({ ...get(), forUser: USER })).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unauthorized }),
    );
    expect(sent).toEqual([]);
  });

  it('does not ask who the token belongs to when the request is not made for anyone', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });
    const { client } = aClient(fetch, { token: signedInAs(aUserId('user-2')) });

    expect((await client.request(get())).ok).toBe(true);
    expect(sent).toHaveLength(1);
  });
});

describe('HttpClient, the statuses that say to come back later', () => {
  it.each([HTTP_STATUS.RequestTimeout, HTTP_STATUS.TooManyRequests])(
    'turns the status %s into networkUnavailable: nothing is said of the request',
    async (status) => {
      const { fetch } = scriptedFetch({ status, body: '{"error":{"code":"later"}}' });

      expect(await aClient(fetch).client.request(get())).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
      );
    },
  );

  it.each([300, 301, 302, 304, 307, 308])(
    'does not take the status %s for a success: a redirect is not an answer',
    async (status) => {
      const { fetch } = scriptedFetch({ status, body: '{"id":"a","count":1}' });

      expect(await aClient(fetch).client.request(get())).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: `status ${status}` }),
      );
    },
  );

  it('takes the first and the last status of the successes for successes', async () => {
    for (const status of [200, 299]) {
      const { fetch } = scriptedFetch({ status, body: '{"id":"a","count":1}' });
      expect((await aClient(fetch).client.request(get())).ok).toBe(true);
    }
  });
});

describe('HttpClient, what every request says', () => {
  it('refuses a redirect and asks for nothing to be stored', async () => {
    const { fetch, sent } = scriptedFetch({ status: 200, body: '{"id":"a","count":1}' });

    await aClient(fetch).client.request(get());

    expect(sent[0]?.init.redirect).toBe('error');
    expect(sent[0]?.init.headers[HTTP_HEADER.CacheControl]).toBe('no-store');
  });

  it('says it also for a request that carries no token', async () => {
    const { fetch, sent } = scriptedFetch();

    await aClient(fetch).client.request({ ...get(), authenticated: false });

    expect(sent[0]?.init.redirect).toBe('error');
    expect(sent[0]?.init.headers[HTTP_HEADER.CacheControl]).toBe('no-store');
  });
});

describe('HttpClient, the size of an answer', () => {
  const MAX = MAX_RESPONSE_BYTES;

  function answering(response: Partial<FetchedResponse> & { text?: () => Promise<string> }) {
    const read = jest.fn(response.text ?? (() => Promise.resolve('{"id":"a","count":1}')));
    const fetch: FetchFunction = () =>
      Promise.resolve({ status: 200, text: read, ...response } as FetchedResponse);
    return { fetch, read };
  }

  const length = (bytes: number | string) => ({
    get: (name: string) => (name.toLowerCase() === 'content-length' ? String(bytes) : null),
  });

  it('refuses an answer that declares more than the maximum, without reading it', async () => {
    const { fetch, read } = answering({ headers: length(MAX + 1) });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' }),
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('accepts an answer that declares exactly the maximum, and one that declares nothing usable', async () => {
    for (const declared of [MAX, 'nonsense', '', '-5']) {
      const { fetch } = answering({ headers: length(declared) });
      expect((await aClient(fetch).client.request(get())).ok).toBe(true);
    }
  });

  it('stops reading a body that grows past the maximum, and cancels it', async () => {
    const chunk = new Uint8Array(MAX / 2 + 1).fill(0x20);
    let reads = 0;
    const cancel = jest.fn(() => Promise.resolve());
    const { fetch } = answering({
      body: {
        getReader: () => ({
          read: () => {
            reads += 1;
            return Promise.resolve({ done: false, value: chunk });
          },
          cancel,
        }),
      },
    });

    const answer = await aClient(fetch).client.request(get());

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' }),
    );
    expect(reads).toBe(2);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('reads a body that arrives in pieces, and puts it back together', async () => {
    const pieces = [new TextEncoder().encode('{"id":"a",'), new TextEncoder().encode('"count":1}')];
    let next = 0;
    const { fetch } = answering({
      body: {
        getReader: () => ({
          read: () => {
            const value = pieces[next];
            next += 1;
            return Promise.resolve(value === undefined ? { done: true } : { done: false, value });
          },
          cancel: () => Promise.resolve(),
        }),
      },
    });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(ok({ id: 'a', count: 1 }));
  });

  it('refuses a text that is longer than the maximum when the platform gives no stream', async () => {
    const { fetch } = answering({ text: () => Promise.resolve(' '.repeat(MAX + 1)) });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' }),
    );
  });

  it('is networkUnavailable when the stream breaks', async () => {
    const { fetch } = answering({
      body: {
        getReader: () => ({
          read: () => Promise.reject(new Error('reset')),
          cancel: () => Promise.resolve(),
        }),
      },
    });

    expect(await aClient(fetch).client.request(get())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
    );
  });
});

describe('HttpClient, an action whose answer holds nothing to read', () => {
  it('succeeds on a success whatever the body is, and does not read it', async () => {
    for (const body of ['', 'not json', '{"anything":1}', '<html>']) {
      const read = jest.fn(() => Promise.resolve(body));
      const client = aClient(() => Promise.resolve({ status: 200, text: read })).client;

      expect(await client.perform({ ...get(), method: HTTP_METHOD.Post })).toStrictEqual(
        ok(undefined),
      );
      expect(read).not.toHaveBeenCalled();
    }
  });

  it('reads the description of a rejection, like any request', async () => {
    const { fetch } = scriptedFetch({
      status: HTTP_STATUS.UnprocessableContent,
      body: '{"error":{"code":"resolutionClosed"}}',
    });

    expect(await aClient(fetch).client.perform(get())).toStrictEqual(
      err({ code: HTTP_FAILURE_CODE.RequestRejected, error: { code: 'resolutionClosed' } }),
    );
  });

  it('fails like any request on the statuses that are not a success', async () => {
    const { fetch } = scriptedFetch({ status: 401 }, { status: 500 }, new TypeError('offline'));
    const { client } = aClient(fetch);

    expect(await client.perform(get())).toStrictEqual(err({ code: 'unauthorized' }));
    expect(await client.perform(get())).toStrictEqual(
      err({ code: 'unexpected', cause: 'status 500' }),
    );
    expect(await client.perform(get())).toStrictEqual(err({ code: 'networkUnavailable' }));
  });
});
