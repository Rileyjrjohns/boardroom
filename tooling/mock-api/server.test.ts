import type { AddressInfo } from 'node:net';

import { FakeClock } from '@application/testing/FakeClock';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { findResolution } from '@domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { checkVotingEligibility } from '@domain/policies/votingEligibility';
import { aDuration, aVote, NOW } from '@domain/testing/builders';
import { isErr } from '@domain/shared/Result';
import { createVote } from '@domain/entities/Vote';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { HttpAuthSession } from '@infrastructure/http/HttpAuthSession';
import { HttpClient } from '@infrastructure/http/HttpClient';
import { HttpDocumentRepository } from '@infrastructure/http/HttpDocumentRepository';
import { HttpMeetingRepository } from '@infrastructure/http/HttpMeetingRepository';
import { HttpVoteRepository } from '@infrastructure/http/HttpVoteRepository';
import { HTTP_HEADER, HTTP_STATUS } from '@infrastructure/http/protocol';
import { DEMO_PASSWORD } from '@infrastructure/in-memory/seed';
import { InMemoryDocumentContent } from '@infrastructure/in-memory/InMemoryDocumentContent';
import { SessionVault } from '@infrastructure/secure-storage/SessionVault';
import { MemorySecureStorage } from '@infrastructure/testing/MemorySecureStorage';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { parseEmailAddress } from '@domain/value-objects/EmailAddress';

import { createMockApiServer } from './server';
import type { MockApiServer } from './server';

// The mock API as a program, started on a port of its own (the system picks a free one), and used
// the way the app uses it: through the real HTTP adapters over the real `fetch` of Node, with
// nothing replaced between the client and the server. The routes themselves are checked in
// src/infrastructure/mock-api/MockApi.test.ts; what this file adds is the translation between Node
// and the `Request` and `Response` of the API, and that the whole path works.

const clock = new FakeClock(NOW);
const requests: string[] = [];
let mock: MockApiServer;
let baseUrl: string;

beforeAll(async () => {
  const created = createMockApiServer({
    clock,
    latencyMillis: 0,
    onRequest: (line) => requests.push(line),
  });
  if (!created.ok) throw new Error(`The mock API was not built: ${created.error.detail}`);
  mock = created.value;
  await new Promise<void>((resolve) => mock.server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(mock.server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  mock.server.closeAllConnections();
  await new Promise<void>((resolve) => mock.server.close(() => resolve()));
});

beforeEach(() => {
  requests.length = 0;
});

/** The adapters of a device talking to the server over HTTP. */
function aDevice() {
  const monitoring = new FakeMonitoring();
  const vault = new SessionVault({ storage: new MemorySecureStorage(), monitoring });
  const client = new HttpClient({ baseUrl, timeout: aDuration(5000), tokens: vault, monitoring });
  return {
    monitoring,
    auth: new HttpAuthSession({ client, vault, clock, monitoring }),
    meetings: new HttpMeetingRepository(client, monitoring),
    documents: new HttpDocumentRepository(client, monitoring, new InMemoryDocumentContent()),
    votes: new HttpVoteRepository(client, monitoring),
  };
}

const credentials = (email: string) => {
  const parsed = parseEmailAddress(email);
  if (!parsed.ok) throw new Error('The email of the seed is not one.');
  return { email: parsed.value, password: DEMO_PASSWORD };
};

describe('npm run mock:api, started on an ephemeral port', () => {
  it('lets a device sign in, list, open a meeting, and vote, through the HTTP adapters', async () => {
    const device = aDevice();
    const [alice] = mock.accounts;
    if (alice === undefined) throw new Error('The server has no account.');

    // Sign in.
    const signedIn = await device.auth.signIn(credentials(alice.email));
    if (!signedIn.ok) throw new Error(`The sign-in failed: ${JSON.stringify(signedIn.error)}`);
    expect(signedIn.value.user.email).toBe(alice.email);
    expect(signedIn.value.expiresAt).toBeGreaterThan(clock.now());

    // List the upcoming meetings, page by page.
    const firstPage = await device.meetings.list(
      MEETING_PERIOD.Upcoming,
      unwrapOk(createPageRequest({ limit: 5 })),
    );
    if (!firstPage.ok) throw new Error('The list failed.');
    expect(firstPage.value.items).toHaveLength(5);
    expect(firstPage.value.nextCursor).toBeDefined();
    const secondPage = await device.meetings.list(
      MEETING_PERIOD.Upcoming,
      unwrapOk(
        createPageRequest({
          limit: 5,
          ...(firstPage.value.nextCursor === undefined
            ? {}
            : { cursor: firstPage.value.nextCursor }),
        }),
      ),
    );
    expect(secondPage.ok && secondPage.value.items[0]?.id).not.toBe(firstPage.value.items[0]?.id);

    // Open the first meeting and one of its documents.
    const summary = firstPage.value.items[0];
    if (summary === undefined) throw new Error('The list is empty.');
    const meeting = await device.meetings.get(summary.id);
    if (!meeting.ok) throw new Error('The meeting could not be read.');
    expect(meeting.value.agenda.length).toBeGreaterThan(0);
    const document = meeting.value.documents[0];
    if (document === undefined) throw new Error('The meeting has no document.');
    expect(await device.documents.get(document.id)).toStrictEqual({ ok: true, value: document });
    expect((await device.documents.fetchContent(document.id)).ok).toBe(true);

    // Vote on a resolution the user may vote on.
    const target = meeting.value.agenda
      .flatMap((item) => (item.resolution === undefined ? [] : [item.resolution]))
      .find(
        (resolution) =>
          resolution.status === RESOLUTION_STATUS.Open &&
          !isErr(
            checkVotingEligibility({
              meeting: meeting.value,
              resolutionId: resolution.id,
              voterId: signedIn.value.user.id,
              queuedVotes: [],
              now: clock.now(),
            }),
          ),
      );
    if (target === undefined) throw new Error('The meeting has no resolution to vote on.');
    const vote = createVote({
      resolutionId: target.id,
      meetingId: meeting.value.id,
      voterId: signedIn.value.user.id,
      choice: VOTE_CHOICE.For,
      castAt: clock.now(),
    });
    expect(await device.votes.submit(vote)).toStrictEqual({ ok: true, value: undefined });
    expect(await device.votes.submit(vote)).toStrictEqual({ ok: true, value: undefined });
    expect(await device.votes.submit({ ...vote, choice: VOTE_CHOICE.Against })).toStrictEqual({
      ok: false,
      error: { code: VOTING_ERROR_CODE.AlreadyVoted, source: 'recorded' },
    });

    // The server remembers the vote of the user, on the meeting it returns next.
    const again = await device.meetings.get(summary.id);
    expect(again.ok && findResolution(again.value, target.id)?.recordedVote).toBe(VOTE_CHOICE.For);
  });

  it('refuses a request without a token, a wrong password and an unknown route, as JSON', async () => {
    const device = aDevice();
    const [alice] = mock.accounts;

    expect(await device.meetings.get('meeting-001' as never)).toStrictEqual({
      ok: false,
      error: { code: REPOSITORY_ERROR_CODE.Unauthorized },
    });
    expect(
      await device.auth.signIn({ ...credentials(alice?.email ?? ''), password: 'nope' }),
    ).toMatchObject({ ok: false, error: { code: 'invalidCredentials' } });

    const unknown = await fetch(`${baseUrl}/nowhere`);
    expect(unknown.status).toBe(HTTP_STATUS.NotFound);
    expect(unknown.headers.get(HTTP_HEADER.ContentType)).toBe('application/json');
    expect(await unknown.json()).toEqual({ error: { code: 'notFound' } });
  });

  it('refuses a body that is too big before it reads it all', async () => {
    const answer = await fetch(`${baseUrl}/votes`, {
      method: 'POST',
      body: 'x'.repeat(200 * 1024),
    });

    expect(answer.status).toBe(HTTP_STATUS.RequestEntityTooLarge);
  });

  it('logs the method, the path and the status of each request, without the query or the token', async () => {
    const device = aDevice();
    const [alice] = mock.accounts;
    await device.auth.signIn(credentials(alice?.email ?? ''));
    await device.meetings.list(MEETING_PERIOD.Past, unwrapOk(createPageRequest({ limit: 3 })));

    expect(requests).toEqual(['POST /auth/sign-in 200', 'GET /meetings 200']);
  });

  it('answers a request that Node sent with a malformed path without crashing', async () => {
    const answer = await fetch(`${baseUrl}/meetings/%E0%A4%A`);

    expect(answer.status).toBe(HTTP_STATUS.NotFound);
  });

  it('serves the same seed to every device: two devices see the same meetings', async () => {
    const [alice] = mock.accounts;
    const first = aDevice();
    const second = aDevice();
    await first.auth.signIn(credentials(alice?.email ?? ''));
    await second.auth.signIn(credentials(alice?.email ?? ''));
    const page = unwrapOk(createPageRequest({ limit: 4 }));

    expect(await first.meetings.list(MEETING_PERIOD.Past, page)).toStrictEqual(
      await second.meetings.list(MEETING_PERIOD.Past, page),
    );
  });
});

describe('createMockApiServer', () => {
  it('reports a latency it cannot hold instead of starting', () => {
    expect(createMockApiServer({ latencyMillis: -1 })).toEqual({
      ok: false,
      error: { detail: 'invalid duration -1' },
    });
    expect(createMockApiServer({ sessionLifetimeMillis: 1.5 }).ok).toBe(false);
  });

  it('reports a clock that leaves no room for the seed instead of starting', () => {
    const created = createMockApiServer({ clock: new FakeClock(1000 as never) });

    expect(created.ok).toBe(false);
  });

  it('is the same vote as the one the adapters test with', () => {
    // A guard for the helper above: the vote it builds is the one the contract suites build.
    expect(aVote().idempotencyKey).toBe('12.resolution-1.user-1');
  });
});

function unwrapOk<T, E>(result: { ok: true; value: T } | { ok: false; error: E }): T {
  if (!result.ok) throw new Error('Expected a success.');
  return result.value;
}
