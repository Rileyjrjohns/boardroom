import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import { aDuration, aUserId } from '@testing/domain/builders';

import { HttpClient } from './HttpClient';
import type {
  BearerTokenSource,
  FetchFunction,
  FetchRequestInit,
  FetchedResponse,
  HttpDownloadSpec,
} from './HttpClient';
import { HTTP_RESOURCE } from './invalidResponse';
import { HTTP_HEADER, HTTP_METHOD, HTTP_STATUS } from './protocol';

// The download of a file by the client, against a `fetch` that answers what the test scripts. The
// download over the real `fetch` of Node, through MSW, is exercised by HttpDocumentRepository.test.ts.

const BASE_URL = 'https://api.boardroom.example/v1';
const TOKEN = 'a-very-secret-token';
const USER = aUserId('user-1');
const PDF_TYPE = 'application/pdf';
const MAX_BYTES = 1000;

const bytesOf = (size: number, fill = 7): Uint8Array => new Uint8Array(size).fill(fill);

interface Sent {
  readonly url: string;
  readonly init: FetchRequestInit;
}

interface ScriptedAnswer {
  readonly status?: number;
  readonly headers?: Record<string, string>;
  /** The body as a stream of these chunks. */
  readonly chunks?: readonly Uint8Array[];
  /** The body as bytes, for a platform with no stream. */
  readonly buffer?: Uint8Array;
}

/** What the test learns of how the body was read. */
interface Reading {
  streamsOpened: number;
  chunksRead: number;
  cancelled: boolean;
  bufferRead: boolean;
  textRead: boolean;
}

function scripted(answer: ScriptedAnswer | Error | 'never') {
  const sent: Sent[] = [];
  const reading: Reading = {
    streamsOpened: 0,
    chunksRead: 0,
    cancelled: false,
    bufferRead: false,
    textRead: false,
  };
  const fetch: FetchFunction = (url, init) => {
    sent.push({ url, init });
    if (answer instanceof Error) return Promise.reject(answer);
    if (answer === 'never') return new Promise<FetchedResponse>(() => undefined);
    const headers = new Map(
      Object.entries(answer.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
    );
    const response: FetchedResponse = {
      status: answer.status ?? HTTP_STATUS.Ok,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
      text: () => {
        reading.textRead = true;
        return Promise.resolve('text');
      },
      ...(answer.chunks === undefined
        ? {}
        : {
            body: {
              getReader: () => {
                reading.streamsOpened += 1;
                let next = 0;
                const chunks = answer.chunks ?? [];
                return {
                  read: () => {
                    const value = chunks[next];
                    next += 1;
                    if (value !== undefined) reading.chunksRead += 1;
                    return Promise.resolve(
                      value === undefined ? { done: true } : { done: false, value },
                    );
                  },
                  cancel: () => {
                    reading.cancelled = true;
                    return Promise.resolve();
                  },
                };
              },
            },
          }),
      ...(answer.buffer === undefined
        ? {}
        : {
            arrayBuffer: () => {
              reading.bufferRead = true;
              return Promise.resolve(answer.buffer?.buffer as ArrayBuffer);
            },
          }),
    };
    return Promise.resolve(response);
  };
  return { fetch, sent, reading };
}

function aClient(
  fetch: FetchFunction,
  options: { token?: 'none' | 'unreadable'; timeout?: number } = {},
) {
  const monitoring = new FakeMonitoring();
  const tokens: BearerTokenSource = {
    token: () =>
      Promise.resolve(
        options.token === 'unreadable'
          ? storageReadFailedResult
          : ok(options.token === 'none' ? undefined : { token: TOKEN, userId: USER }),
      ),
  };
  return {
    monitoring,
    client: new HttpClient({
      baseUrl: BASE_URL,
      timeout: aDuration(options.timeout ?? 1000),
      tokens,
      monitoring,
      fetch,
    }),
  };
}

const storageReadFailedResult = { ok: false, error: storageReadFailed() } as const;

const spec = (overrides: Partial<HttpDownloadSpec> = {}): HttpDownloadSpec => ({
  method: HTTP_METHOD.Get,
  path: '/files/a',
  resource: HTTP_RESOURCE.DocumentContent,
  mediaType: PDF_TYPE,
  maxBytes: MAX_BYTES,
  ...overrides,
});

const PDF_ANSWER = {
  headers: { [HTTP_HEADER.ContentType]: PDF_TYPE, [HTTP_HEADER.ETag]: '"v7"' },
  chunks: [bytesOf(300), bytesOf(200)],
} as const;

describe('HttpClient, downloading a file', () => {
  describe('the request', () => {
    it('is a GET that accepts the media type it asks for, is not to be stored, and carries the token', async () => {
      const { fetch, sent } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch);

      await client.download(spec());

      expect(sent).toHaveLength(1);
      expect(sent[0]?.url).toBe(`${BASE_URL}/files/a`);
      expect(sent[0]?.init.method).toBe('GET');
      expect(sent[0]?.init.redirect).toBe('error');
      expect(sent[0]?.init.headers).toEqual({
        [HTTP_HEADER.Accept]: PDF_TYPE,
        [HTTP_HEADER.CacheControl]: 'no-store',
        [HTTP_HEADER.Authorization]: `Bearer ${TOKEN}`,
      });
    });

    it('lets the caller say more headers, which win over the ones it sets', async () => {
      const { fetch, sent } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch);

      await client.download(spec({ headers: { [HTTP_HEADER.Accept]: 'application/x-other' } }));

      expect(sent[0]?.init.headers[HTTP_HEADER.Accept]).toBe('application/x-other');
    });

    it('is not sent, and is unauthorized, when nobody is signed in', async () => {
      const { fetch, sent } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch, { token: 'none' });

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unauthorized },
      });
      expect(sent).toEqual([]);
    });

    it('is not sent, and is unexpected, when the token cannot be read', async () => {
      const { fetch, sent } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch, { token: 'unreadable' });

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'credentials unreadable' },
      });
      expect(sent).toEqual([]);
    });

    it('is not sent, and is unexpected, when the path cannot be built', async () => {
      const { fetch, sent } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch);

      const failed = await client.download(() => {
        throw new Error('a secret path');
      });

      expect(failed).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'request could not be built' },
      });
      expect(sent).toEqual([]);
    });
  });

  describe('the answer', () => {
    it('gives the bytes, the version it was given, and the user whose token the request carried', async () => {
      const { fetch } = scripted(PDF_ANSWER);
      const { client } = aClient(fetch);

      const downloaded = await client.download(spec());

      expect(downloaded.ok && Array.from(downloaded.value.bytes)).toEqual([
        ...Array.from(bytesOf(300)),
        ...Array.from(bytesOf(200)),
      ]);
      expect(downloaded.ok && downloaded.value.etag).toBe('"v7"');
      expect(downloaded.ok && downloaded.value.userId).toBe(USER);
    });

    it('gives no version when the server gave none', async () => {
      const { fetch } = scripted({
        headers: { [HTTP_HEADER.ContentType]: PDF_TYPE },
        chunks: [bytesOf(10)],
      });
      const { client } = aClient(fetch);

      const downloaded = await client.download(spec());

      expect(downloaded.ok && downloaded.value.etag).toBeUndefined();
    });

    it('accepts an empty file: judging what is in it is for the caller', async () => {
      const { fetch } = scripted({ headers: PDF_ANSWER.headers, chunks: [] });
      const { client } = aClient(fetch);

      const downloaded = await client.download(spec());

      expect(downloaded.ok && downloaded.value.bytes.byteLength).toBe(0);
    });

    it.each([
      ['with parameters', 'application/pdf; charset=binary'],
      ['in upper case', 'APPLICATION/PDF'],
      ['with spaces', '  application/pdf  ;q=1'],
    ])('accepts the media type %s', async (_name, contentType) => {
      const { fetch } = scripted({
        headers: { [HTTP_HEADER.ContentType]: contentType },
        chunks: [bytesOf(10)],
      });
      const { client } = aClient(fetch);

      expect((await client.download(spec())).ok).toBe(true);
    });

    it('reads a platform that gives no stream through its buffer', async () => {
      const { fetch, reading } = scripted({ headers: PDF_ANSWER.headers, buffer: bytesOf(400) });
      const { client } = aClient(fetch);

      const downloaded = await client.download(spec());

      expect(downloaded.ok && downloaded.value.bytes.byteLength).toBe(400);
      expect(reading.bufferRead).toBe(true);
      expect(reading.textRead).toBe(false);
    });

    it('refuses a buffer that is bigger than the maximum, though nothing said so', async () => {
      const { fetch } = scripted({ headers: PDF_ANSWER.headers, buffer: bytesOf(MAX_BYTES + 1) });
      const { client } = aClient(fetch);

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' },
      });
    });

    it('is a network that failed when the platform gives neither a stream nor a buffer', async () => {
      const { fetch } = scripted({ headers: PDF_ANSWER.headers });
      const { client } = aClient(fetch);

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
    });
  });

  describe('the media type', () => {
    it.each(['text/html', 'application/json', 'application/octet-stream', ''])(
      'refuses %j before a byte is read',
      async (contentType) => {
        const { fetch, reading } = scripted({
          headers: contentType === '' ? {} : { [HTTP_HEADER.ContentType]: contentType },
          chunks: [bytesOf(10)],
        });
        const { client } = aClient(fetch);

        expect(await client.download(spec())).toEqual({
          ok: false,
          error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'unexpected media type' },
        });
        expect(reading.streamsOpened).toBe(0);
      },
    );
  });

  describe('the size', () => {
    it('refuses a file that declares more than the maximum, unread', async () => {
      const { fetch, reading } = scripted({
        headers: { ...PDF_ANSWER.headers, [HTTP_HEADER.ContentLength]: String(MAX_BYTES + 1) },
        chunks: [bytesOf(10)],
      });
      const { client } = aClient(fetch);

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' },
      });
      expect(reading.streamsOpened).toBe(0);
    });

    it('stops reading, and cancels the stream, once the body grows past the maximum', async () => {
      const { fetch, reading } = scripted({
        headers: PDF_ANSWER.headers,
        chunks: [bytesOf(600), bytesOf(600), bytesOf(600)],
      });
      const { client } = aClient(fetch);

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'response too large' },
      });
      expect(reading.chunksRead).toBe(2);
      expect(reading.cancelled).toBe(true);
    });

    it('accepts a file of exactly the maximum', async () => {
      const { fetch } = scripted({
        headers: { ...PDF_ANSWER.headers, [HTTP_HEADER.ContentLength]: String(MAX_BYTES) },
        chunks: [bytesOf(MAX_BYTES)],
      });
      const { client } = aClient(fetch);

      expect((await client.download(spec())).ok).toBe(true);
    });

    it('ignores a length that is not a number', async () => {
      const { fetch } = scripted({
        headers: { ...PDF_ANSWER.headers, [HTTP_HEADER.ContentLength]: 'many' },
        chunks: [bytesOf(10)],
      });
      const { client } = aClient(fetch);

      expect((await client.download(spec())).ok).toBe(true);
    });
  });

  describe('a refusal', () => {
    it.each([
      [HTTP_STATUS.Unauthorized, { code: REPOSITORY_ERROR_CODE.Unauthorized }],
      [HTTP_STATUS.Forbidden, { code: REPOSITORY_ERROR_CODE.Forbidden }],
      [HTTP_STATUS.NotFound, { code: REPOSITORY_ERROR_CODE.NotFound }],
      [HTTP_STATUS.RequestTimeout, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.TooManyRequests, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.BadGateway, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.ServiceUnavailable, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.GatewayTimeout, { code: REPOSITORY_ERROR_CODE.NetworkUnavailable }],
      [HTTP_STATUS.BadRequest, { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 400' }],
      [
        HTTP_STATUS.InternalServerError,
        { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 500' },
      ],
      [
        HTTP_STATUS.UnprocessableContent,
        { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 422' },
      ],
      [302, { code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 302' }],
    ])(
      'with the status %i is the error the other requests answer, and its body is not read',
      async (status, error) => {
        const { fetch, reading, sent } = scripted({
          status,
          headers: { [HTTP_HEADER.ContentType]: 'application/json' },
          chunks: [bytesOf(10)],
        });
        const { client } = aClient(fetch);

        expect(await client.download(spec())).toEqual({ ok: false, error });
        expect(reading.streamsOpened).toBe(0);
        expect(reading.textRead).toBe(false);
        // What was left unread is dropped with the connection.
        expect(sent[0]?.init.signal.aborted).toBe(true);
      },
    );
  });

  describe('time and failure', () => {
    it('is a network that failed when the request does not go through', async () => {
      const { fetch } = scripted(new TypeError('Network request failed: https://secret.example'));
      const { client } = aClient(fetch);

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
    });

    it('is a network that failed when the server never answers, at the timeout of the client', async () => {
      const { fetch, sent } = scripted('never');
      const { client } = aClient(fetch, { timeout: 40 });

      expect(await client.download(spec())).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
      expect(sent[0]?.init.signal.aborted).toBe(true);
    });

    it('takes the timeout of the download when it has one, and not the one of the client', async () => {
      const { fetch, sent } = scripted('never');
      const { client } = aClient(fetch, { timeout: 5000 });

      const failed = await client.download(spec({ timeout: aDuration(30) }));

      expect(failed).toEqual({
        ok: false,
        error: { code: REPOSITORY_ERROR_CODE.NetworkUnavailable },
      });
      expect(sent[0]?.init.signal.aborted).toBe(true);
    });

    it('puts no address, token or path in anything it answers', async () => {
      const failures = [
        scripted(new TypeError(`Network request failed: ${BASE_URL}`)),
        scripted({ status: HTTP_STATUS.InternalServerError }),
        scripted({ headers: { [HTTP_HEADER.ContentType]: 'text/html' }, chunks: [] }),
        scripted({ headers: PDF_ANSWER.headers, chunks: [bytesOf(MAX_BYTES + 1)] }),
      ];

      const answers = await Promise.all(
        failures.map(({ fetch }) => aClient(fetch).client.download(spec())),
      );

      expect(JSON.stringify(answers)).not.toMatch(
        /boardroom\.example|a-very-secret-token|files\/a/,
      );
    });
  });
});
