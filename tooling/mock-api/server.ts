import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { durationFromMillis } from '@domain/value-objects/Duration';
import type { Duration } from '@domain/value-objects/Duration';
import type { Clock } from '@application/ports/Clock';
import { SystemClock } from '@infrastructure/clock/SystemClock';
import { timerSleep } from '@infrastructure/clock/sleep';
import {
  HTTP_HEADER,
  HTTP_METHOD,
  HTTP_STATUS,
  MEDIA_TYPE_JSON,
} from '@infrastructure/http/protocol';
import { InMemoryBackend } from '@infrastructure/in-memory/InMemoryBackend';
import { buildSeed } from '@infrastructure/in-memory/seed';
import { SimulatedNetwork } from '@infrastructure/in-memory/SimulatedNetwork';
import { API_ERROR_CODE, MockApi } from '@infrastructure/mock-api/MockApi';

// The mock API as a program: the routes of `MockApi`, over the `http` module of Node, serving the
// same simulated server and the same seed as the mock configuration of the app. It holds no rule of
// its own: it turns a request of Node into a `Request`, asks `MockApi`, and writes the `Response`.
// Not part of the app: nothing under app/ or src/ reaches it.

/** The most a request may carry. The biggest body of the API is a vote. */
const MAX_BODY_BYTES = 64 * 1024;

const MILLIS_PER_HOUR = 3_600_000;
/** A working day, like the mock configuration of the app. */
const DEFAULT_SESSION_LIFETIME_MILLIS = 8 * MILLIS_PER_HOUR;
/** Long enough to see a loading state, short enough not to get in the way. */
const DEFAULT_LATENCY_MILLIS = 200;

const DEFAULT_HOST = 'localhost';
const CONNECTION_HEADER = 'connection';
const CONNECTION_CLOSE = 'close';

export interface MockApiServerOptions {
  /** How long the server takes to answer, in milliseconds. */
  readonly latencyMillis?: number;
  /** How long a token lasts, in milliseconds. */
  readonly sessionLifetimeMillis?: number;
  /** The clock of the server. The seed, the voting windows and the tokens all follow it. */
  readonly clock?: Clock;
  /** Called with each request once it is answered: the method, the path and the status. */
  readonly onRequest?: (line: string) => void;
}

/** Why the server could not be built. */
export interface MockApiServerError {
  readonly detail: string;
}

export interface MockApiServer {
  readonly server: Server;
  readonly api: MockApi;
  /** The accounts a client can sign in with, with the password of the simulation. */
  readonly accounts: readonly { readonly email: string }[];
}

function milliseconds(millis: number): Result<Duration, MockApiServerError> {
  const duration = durationFromMillis(millis);
  return duration.ok ? duration : { ok: false, error: { detail: `invalid duration ${millis}` } };
}

/** The server, not listening yet, or the reason it cannot be built. */
export function createMockApiServer(
  options: MockApiServerOptions = {},
): Result<MockApiServer, MockApiServerError> {
  const clock = options.clock ?? new SystemClock();
  const latency = milliseconds(options.latencyMillis ?? DEFAULT_LATENCY_MILLIS);
  const lifetime = milliseconds(options.sessionLifetimeMillis ?? DEFAULT_SESSION_LIFETIME_MILLIS);
  if (isErr(latency)) return latency;
  if (isErr(lifetime)) return lifetime;

  const seed = buildSeed(clock.now());
  if (isErr(seed)) return { ok: false, error: { detail: seed.error.detail } };

  const network = new SimulatedNetwork({ sleep: timerSleep, latency: latency.value });
  const backend = InMemoryBackend.create({
    clock,
    // Every request names its caller (see `MockApi`); nobody is the caller of the others.
    auth: { current: () => Promise.resolve(ok(undefined)) },
    network,
    content: seed.value.content,
  });
  if (isErr(backend)) return { ok: false, error: { detail: backend.error.code } };

  const api = new MockApi({
    backend: backend.value,
    clock,
    accounts: seed.value.accounts,
    sessionLifetime: lifetime.value,
    generateToken: randomUUID,
  });

  const server = http.createServer((request, response) => {
    void serve(api, request, response, options.onRequest);
  });
  return ok({
    server,
    api,
    accounts: seed.value.accounts.map(({ user }) => ({ email: user.email })),
  });
}

/** Answers a request of Node with the response of the API. Never rejects. */
async function serve(
  api: MockApi,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  onRequest: MockApiServerOptions['onRequest'],
): Promise<void> {
  let status: number = HTTP_STATUS.InternalServerError;
  try {
    const request = await toRequest(incoming);
    const response =
      request === undefined
        ? errorResponse(HTTP_STATUS.RequestEntityTooLarge, API_ERROR_CODE.BadRequest)
        : await api.handle(request);
    status = response.status;
    const headers = Object.fromEntries(response.headers);
    // The body of a request that was too big was not read to the end: the connection cannot be
    // used for another request, so it is closed once the answer is out.
    if (request === undefined) headers[CONNECTION_HEADER] = CONNECTION_CLOSE;
    outgoing.writeHead(status, headers);
    outgoing.end(Buffer.from(await response.arrayBuffer()), () => {
      if (request === undefined) incoming.destroy();
    });
  } catch {
    if (!outgoing.headersSent) {
      outgoing.writeHead(status, { [HTTP_HEADER.ContentType]: MEDIA_TYPE_JSON });
    }
    outgoing.end(JSON.stringify({ error: { code: API_ERROR_CODE.Unexpected } }));
  }
  try {
    onRequest?.(`${incoming.method ?? ''} ${(incoming.url ?? '').split('?')[0] ?? ''} ${status}`);
  } catch {
    // A logger that fails must not take the server down.
  }
}

function errorResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { [HTTP_HEADER.ContentType]: MEDIA_TYPE_JSON },
  });
}

/** The `Request` a request of Node stands for, or `undefined` when its body is too big. */
async function toRequest(incoming: IncomingMessage): Promise<Request | undefined> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const method = incoming.method ?? HTTP_METHOD.Get;
  const url = `http://${incoming.headers.host ?? DEFAULT_HOST}${incoming.url ?? '/'}`;
  if (method === HTTP_METHOD.Get || method === HTTP_METHOD.Head) {
    return new Request(url, { method, headers });
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of incoming) {
    const buffer = Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return undefined;
    chunks.push(buffer);
  }
  return new Request(url, { method, headers, body: Buffer.concat(chunks) });
}
