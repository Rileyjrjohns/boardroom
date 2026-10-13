import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';

import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { aDuration, aUser, anEmail, MILLIS_PER_HOUR } from '@domain/testing/builders';
import type { UserId } from '@domain/value-objects/ids';

import { HttpClient } from '../http/HttpClient';
import type { HttpClientOptions } from '../http/HttpClient';
import { HttpAuthSession } from '../http/HttpAuthSession';
import { HttpDocumentRepository } from '../http/HttpDocumentRepository';
import { HttpMeetingRepository } from '../http/HttpMeetingRepository';
import { HttpVoteRepository } from '../http/HttpVoteRepository';
import type { DemoAccount } from '../in-memory/InMemoryAuthSession';
import { InMemoryDocumentContent } from '../in-memory/InMemoryDocumentContent';
import { MockApi } from '../mock-api/MockApi';
import { SessionVault } from '../secure-storage/SessionVault';

import { MemorySecureStorage } from './MemorySecureStorage';
import { TEST_PASSWORD, createTestServer } from './testServer';
import type { TestServerOptions } from './testServer';

// Test support, not production code: the HTTP adapters talking to the simulated server through
// MSW, the library that stands in for the network. `installMockApi` is called once, at the top of
// a test file; `createHttpWorld` builds a server and its clients for one test.

/** The address the tests give to the API. Nothing listens there: MSW answers for it. */
export const TEST_API_URL = 'http://api.boardroom.test';

/** How the network behaves for the clients of a test, which a test changes while it runs. */
export interface NetworkConditions {
  /** Whether the device has a connection. Without one, a request fails the way `fetch` does. */
  online: boolean;
  /** How long the server waits before it answers. `'infinite'` is a server that never does. */
  delayMillis: number | 'infinite';
}

/** The API a test file has installed, and the world that answers for it now. */
export interface InstalledMockApi {
  api: MockApi | undefined;
  readonly conditions: NetworkConditions;
  /** The requests the server received, in order, as `METHOD url`. */
  readonly received: string[];
}

/**
 * Starts MSW for the test file that calls it, and stops it at the end. Every request to
 * `TEST_API_URL` is answered by the `MockApi` of the world that was created last; a request to
 * anywhere else fails the test, so that nothing reaches a real network by mistake.
 */
export function installMockApi(): InstalledMockApi {
  const installed: InstalledMockApi = {
    api: undefined,
    conditions: { online: true, delayMillis: 0 },
    received: [],
  };
  const server = setupServer(
    http.all(`${TEST_API_URL}/*`, async ({ request }) => {
      installed.received.push(`${request.method} ${request.url}`);
      if (!installed.conditions.online) return HttpResponse.error();
      await delay(installed.conditions.delayMillis);
      if (installed.api === undefined) return HttpResponse.error();
      return installed.api.handle(request);
    }),
  );
  beforeAll(() => {
    server.listen({ onUnhandledFrame: 'error' });
  });
  afterEach(() => {
    installed.conditions.online = true;
    installed.conditions.delayMillis = 0;
    installed.received.length = 0;
  });
  afterAll(() => {
    server.close();
  });
  return installed;
}

export type HttpServerOptions = TestServerOptions;

/**
 * The server behind the API: the simulated server of the tests with the routes of `MockApi` on it,
 * reached through MSW. Nobody is signed in at first, and the accounts are those of the test server
 * (`user-1`, Alice, and `user-2`, Bruno). The clock is the one of the test server, so that a
 * session expires for the server and, when the device shares it, for the device too.
 */
export function createHttpServerSide(installed: InstalledMockApi, options: HttpServerOptions = {}) {
  const server = createTestServer({ ...options, signedIn: false });
  const accounts: DemoAccount[] = [...server.accounts];
  let tokens = 0;
  const api = new MockApi({
    backend: server.backend,
    clock: server.clock,
    accounts,
    sessionLifetime: aDuration(MILLIS_PER_HOUR),
    generateToken: () => {
      tokens += 1;
      return `token-${tokens}`;
    },
  });
  installed.api = api;
  return { ...server, api, accounts };
}

export interface HttpWorldOptions extends HttpServerOptions {
  /** Overrides what the client is built with: its timeout, for a test of the timeout. */
  readonly client?: Partial<HttpClientOptions>;
  readonly storage?: MemorySecureStorage;
}

/**
 * The server behind the API (`createHttpServerSide`) and the HTTP adapters of a device that talks
 * to it, built by hand the way the composition root builds them.
 */
export async function createHttpWorld(installed: InstalledMockApi, options: HttpWorldOptions = {}) {
  const server = createHttpServerSide(installed, options);
  const { accounts } = server;

  const monitoring = new FakeMonitoring();
  const storage = options.storage ?? new MemorySecureStorage();
  const vault = new SessionVault({ storage, monitoring });
  const client = new HttpClient({
    baseUrl: TEST_API_URL,
    timeout: aDuration(5000),
    tokens: vault,
    monitoring,
    ...options.client,
  });
  const content = new InMemoryDocumentContent();
  const auth = new HttpAuthSession({ client, vault, clock: server.clock, monitoring });

  /** Signs the device in as the user of an account, registering the account if the server lacks it. */
  async function signInAs(userId: UserId): Promise<void> {
    let account = accounts.find(({ user }) => user.id === userId);
    if (account === undefined) {
      account = {
        user: aUser({ id: userId, email: anEmail(`${userId}@example.com`) }),
        password: TEST_PASSWORD,
      };
      accounts.push(account);
    }
    await auth.signIn({ email: account.user.email, password: account.password });
  }

  return {
    ...server,
    monitoring,
    storage,
    vault,
    client,
    auth,
    content,
    signInAs,
    meetings: new HttpMeetingRepository(client, monitoring),
    documents: new HttpDocumentRepository(client, monitoring, content),
    votes: new HttpVoteRepository(client, monitoring),
  };
}

export type HttpWorld = Awaited<ReturnType<typeof createHttpWorld>>;
