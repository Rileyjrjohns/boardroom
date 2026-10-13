import { z } from 'zod';

import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { storageReadFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { aDuration, aUserId } from '@domain/testing/builders';

import { createHttpWorld, installMockApi, TEST_API_URL } from '../testing/httpWorld';

import { HTTP_FAILURE_CODE, HttpClient } from './HttpClient';
import type {
  BearerTokenSource,
  FetchFunction,
  FetchRequestInit,
  FetchedResponse,
} from './HttpClient';
import { HTTP_RESOURCE } from './invalidResponse';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from './protocol';

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

function aClient(
  fetch: FetchFunction,
  options: {
    token?: Result<string | undefined, ReturnType<typeof storageReadFailed>>;
    timeout?: number;
  } = {},
) {
  const monitoring = new FakeMonitoring();
  const tokenCalls = { count: 0 };
  const tokens: BearerTokenSource = {
    token: () => {
      tokenCalls.count += 1;
      return Promise.resolve(options.token ?? ok(TOKEN));
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
      tokens: { token: () => Promise.resolve(ok(current)) },
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

  it.each([400, 405, 409, 418, 429, 500, 501, 301, 304, 100])(
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

    await expect(client.request(get())).resolves.toMatchObject({ ok: false });
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
