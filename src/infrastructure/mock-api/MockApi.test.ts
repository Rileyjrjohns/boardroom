import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { aDuration, aMeetingWithAgenda, aVote, MILLIS_PER_HOUR } from '@domain/testing/builders';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { toVoteRequestWire } from '../http/dto/voteDto';
import { HTTP_HEADER, HTTP_STATUS, ROUTES } from '../http/protocol';
import { hasPdfSignature } from '../pdf/pdfSignature';
import { createHttpServerSide } from '../testing/httpWorld';
import type { InstalledMockApi } from '../testing/httpWorld';
import { TEST_PASSWORD } from '../testing/testServer';

import { API_ERROR_CODE, MockApi } from './MockApi';

// The routes of the API, called directly with a `Request` and read from the `Response`, with no
// network and no client: what the HTTP adapters take for granted of the server, and what the
// documentation in docs/api.md promises. The adapters are run against it in HttpRepositories.test.ts.

const BASE = 'http://api.test';

function aServer() {
  const unused: InstalledMockApi = {
    api: undefined,
    conditions: { online: true, delayMillis: 0 },
    received: [],
    receivedHeaders: [],
    override: undefined,
  };
  const server = createHttpServerSide(unused);
  const [alice] = server.accounts;
  if (alice === undefined) throw new Error('The test server has no account.');

  async function call(
    method: string,
    path: string,
    options: {
      token?: string;
      body?: unknown;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string> = { ...options.headers };
    if (options.token !== undefined) headers[HTTP_HEADER.Authorization] = `Bearer ${options.token}`;
    const body =
      options.rawBody ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
    const response = await server.api.handle(
      new Request(`${BASE}${path}`, { method, headers, ...(body === undefined ? {} : { body }) }),
    );
    const bytes = new Uint8Array(await response.clone().arrayBuffer());
    const text = await response.text();
    return {
      status: response.status,
      contentType: response.headers.get(HTTP_HEADER.ContentType),
      cacheControl: response.headers.get(HTTP_HEADER.CacheControl),
      etag: response.headers.get(HTTP_HEADER.ETag),
      bytes,
      text,
      body:
        text === '' || response.headers.get(HTTP_HEADER.ContentType) !== 'application/json'
          ? undefined
          : (JSON.parse(text) as Record<string, any>),
    };
  }

  async function signIn(email = alice?.user.email as string): Promise<string> {
    const answer = await call('POST', ROUTES.signIn, { body: { email, password: TEST_PASSWORD } });
    return answer.body?.accessToken as string;
  }

  return { ...server, call, signIn, email: alice.user.email as string };
}

const voteRequest = (vote = aVote()) => ({
  body: toVoteRequestWire(vote),
  headers: { [HTTP_HEADER.IdempotencyKey]: encodeURIComponent(vote.idempotencyKey) },
});

describe('MockApi, the routes', () => {
  it.each([
    ['GET', '/'],
    ['GET', '/nowhere'],
    ['POST', '/meetings'],
    ['GET', '/votes'],
    ['PUT', '/votes'],
    ['DELETE', '/meetings/meeting-1'],
    ['GET', '/auth/sign-in'],
    ['GET', '/auth/other'],
    ['POST', '/documents/document-1/content'],
    ['GET', '/documents/document-1/other'],
    ['GET', '/meetings/meeting-1/extra'],
    ['GET', '/meetings/%E0%A4%A'],
  ])('answers 404 and an error body for %s %s', async (method, path) => {
    const { call } = aServer();

    const answer = await call(method, path);

    expect(answer.status).toBe(HTTP_STATUS.NotFound);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.NotFound } });
    expect(answer.contentType).toBe('application/json');
  });
});

describe('MockApi, what every answer says about being kept', () => {
  it('asks that no answer be stored: a success, a refusal, a vote without a body and an unknown route', async () => {
    const { call, signIn } = aServer();
    const token = await signIn();

    const answers = [
      await call('GET', `${ROUTES.meetings}?period=past&limit=5`, { token }),
      await call('GET', `${ROUTES.meetings}?period=past&limit=5`),
      await call('POST', ROUTES.votes, { token, ...voteRequest() }),
      await call('GET', '/nowhere', { token }),
    ];

    expect(answers.map((answer) => answer.status)).toEqual([
      HTTP_STATUS.Ok,
      HTTP_STATUS.Unauthorized,
      HTTP_STATUS.NoContent,
      HTTP_STATUS.NotFound,
    ]);
    expect(answers.map((answer) => answer.cacheControl)).toEqual(answers.map(() => 'no-store'));
  });
});

describe('MockApi, signing in', () => {
  it('grants a token, a lifetime in seconds and the user, on the clock of the server', async () => {
    const { call, email } = aServer();

    const answer = await call('POST', ROUTES.signIn, { body: { email, password: TEST_PASSWORD } });

    expect(answer.status).toBe(HTTP_STATUS.Ok);
    expect(answer.body).toEqual({
      accessToken: 'token-1',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: { id: 'user-1', fullName: 'Alice Martin', email: 'alice@example.com' },
    });
  });

  it('grants a new token at each sign-in', async () => {
    const { signIn } = aServer();

    expect([await signIn(), await signIn()]).toEqual(['token-1', 'token-2']);
  });

  it('takes the email as the domain reads it: trimmed, in lower case', async () => {
    const { call } = aServer();

    const answer = await call('POST', ROUTES.signIn, {
      body: { email: '  ALICE@Example.com ', password: TEST_PASSWORD },
    });

    expect(answer.status).toBe(HTTP_STATUS.Ok);
  });

  it.each([
    ['a wrong password', { email: 'alice@example.com', password: 'nope' }],
    [
      'a password in another case',
      { email: 'alice@example.com', password: TEST_PASSWORD.toUpperCase() },
    ],
    ['an unknown email', { email: 'nobody@example.com', password: TEST_PASSWORD }],
    ['an email that is not one', { email: 'nobody', password: TEST_PASSWORD }],
  ])('answers 401 invalidCredentials for %s', async (_name, body) => {
    const { call } = aServer();

    const answer = await call('POST', ROUTES.signIn, { body });

    expect(answer.status).toBe(HTTP_STATUS.Unauthorized);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.InvalidCredentials } });
  });

  it.each([
    ['text that is not JSON', { rawBody: 'not json' }],
    ['no body', {}],
    ['a body without a password', { body: { email: 'alice@example.com' } }],
    ['a password that is a number', { body: { email: 'alice@example.com', password: 1 } }],
  ])('answers 400 for %s', async (_name, options) => {
    const { call } = aServer();

    const answer = await call('POST', ROUTES.signIn, options);

    expect(answer.status).toBe(HTTP_STATUS.BadRequest);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.BadRequest } });
  });

  it('answers 503 when the simulated server is unreachable, before it looks at the credentials', async () => {
    const { call, network, email } = aServer();
    network.setOnline(false);

    const answer = await call('POST', ROUTES.signIn, { body: { email, password: 'wrong' } });

    expect(answer.status).toBe(HTTP_STATUS.ServiceUnavailable);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.ServiceUnavailable } });
  });

  it('writes a lifetime that is not whole seconds as the whole seconds it grants', async () => {
    const unused: InstalledMockApi = {
      api: undefined,
      conditions: { online: true, delayMillis: 0 },
      received: [],
      receivedHeaders: [],
      override: undefined,
    };
    const server = createHttpServerSide(unused);
    const api = new MockApi({
      backend: server.backend,
      clock: server.clock,
      accounts: server.accounts,
      sessionLifetime: aDuration(90_500),
      generateToken: () => 'only-token',
    });
    const [alice] = server.accounts;

    const response = await api.handle(
      new Request(`${BASE}${ROUTES.signIn}`, {
        method: 'POST',
        body: JSON.stringify({ email: alice?.user.email, password: TEST_PASSWORD }),
      }),
    );

    expect(((await response.json()) as { expiresIn: number }).expiresIn).toBe(90);
  });
});

describe('MockApi, authentication', () => {
  it.each([
    ['without an Authorization header', {}],
    ['with another scheme', { headers: { [HTTP_HEADER.Authorization]: 'Basic abc' } }],
    ['with an empty token', { token: '' }],
    ['with a token nobody was granted', { token: 'invented' }],
  ])('answers 401 to a request %s', async (_name, options) => {
    const { call } = aServer();

    const answer = await call('GET', ROUTES.meetings + '?period=upcoming&limit=5', options);

    expect(answer.status).toBe(HTTP_STATUS.Unauthorized);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.Unauthorized } });
  });

  it('answers 401 to every token once the server has forgotten them', async () => {
    const { call, signIn, api } = aServer();
    const token = await signIn();
    expect((await call('GET', ROUTES.meeting('meeting-1'), { token })).status).toBe(HTTP_STATUS.Ok);

    api.revokeSessions();

    expect((await call('GET', ROUTES.meeting('meeting-1'), { token })).status).toBe(
      HTTP_STATUS.Unauthorized,
    );
  });

  it('answers 401 once the lifetime it granted is over, on the clock of the server', async () => {
    const { call, signIn, clock } = aServer();
    const token = await signIn();
    clock.advance(MILLIS_PER_HOUR - 1);
    expect((await call('GET', ROUTES.meeting('meeting-1'), { token })).status).toBe(HTTP_STATUS.Ok);

    clock.advance(1);

    expect((await call('GET', ROUTES.meeting('meeting-1'), { token })).status).toBe(
      HTTP_STATUS.Unauthorized,
    );
  });

  it('answers each request for the user its token belongs to', async () => {
    const { call, signIn, accounts } = aServer();
    const bruno = accounts[1]?.user.email as string;
    const alice = await signIn();
    const other = await signIn(bruno);

    const asAlice = await call('GET', ROUTES.meeting('meeting-1'), { token: alice });
    const asBruno = await call('GET', ROUTES.meeting('meeting-1'), { token: other });

    expect(asAlice.body?.agenda[1].resolution).not.toHaveProperty('recordedVote');
    expect(asBruno.status).toBe(HTTP_STATUS.Ok);
  });
});

describe('MockApi, reading', () => {
  it('lists a page of summaries for a period, with a limit and a cursor', async () => {
    const { call, signIn, load } = aServer();
    load({
      meetings: [1, 2, 3].map((day) => ({
        ...aMeetingWithAgenda(),
        id: `m-${day}` as never,
        agenda: [],
        scheduledAt: (aMeetingWithAgenda().scheduledAt + day * 1000) as never,
      })),
      recordedVotes: [],
    });
    const token = await signIn();

    const first = await call('GET', `${ROUTES.meetings}?period=upcoming&limit=2`, { token });
    const second = await call(
      'GET',
      `${ROUTES.meetings}?period=upcoming&limit=2&cursor=${encodeURIComponent(first.body?.nextCursor)}`,
      { token },
    );

    expect(first.status).toBe(HTTP_STATUS.Ok);
    expect(first.body?.items.map((item: { id: string }) => item.id)).toEqual(['m-1', 'm-2']);
    expect(Object.keys(first.body?.items[0])).toEqual(['id', 'title', 'scheduledAt', 'location']);
    expect(second.body?.items.map((item: { id: string }) => item.id)).toEqual(['m-3']);
    expect(second.body).not.toHaveProperty('nextCursor');
  });

  it.each([
    ['no period', 'limit=5'],
    ['a period nobody knows', 'period=someday&limit=5'],
    ['no limit', 'period=past'],
    ['a limit of zero', 'period=past&limit=0'],
    ['a limit above the maximum', 'period=past&limit=51'],
    ['a limit that is text', 'period=past&limit=ten'],
    ['a limit that is empty', 'period=past&limit='],
    ['a limit that is not whole', 'period=past&limit=2.5'],
    ['a limit in exponent notation', 'period=past&limit=1e1'],
    ['a limit with a space', 'period=past&limit=%2010'],
    ['a limit with a trailing space', 'period=past&limit=10%20'],
    ['a limit in hexadecimal', 'period=past&limit=0x10'],
    ['a limit in binary', 'period=past&limit=0b11'],
    ['a limit with a sign', 'period=past&limit=%2B5'],
    ['a limit with a leading zero', 'period=past&limit=05'],
    ['a limit with a decimal comma', 'period=past&limit=2,5'],
    ['a cursor that is blank', 'period=past&limit=5&cursor=%20'],
    ['a cursor this server did not write', 'period=past&limit=5&cursor=garbage'],
  ])('answers 400 for %s', async (_name, query) => {
    const { call, signIn } = aServer();
    const token = await signIn();

    const answer = await call('GET', `${ROUTES.meetings}?${query}`, { token });

    expect(answer.status).toBe(HTTP_STATUS.BadRequest);
    expect(answer.body).toEqual({ error: { code: API_ERROR_CODE.BadRequest } });
  });

  it('answers 503 for a listing when the simulated server is unreachable', async () => {
    const { call, signIn, network } = aServer();
    const token = await signIn();
    network.setOnline(false);

    const answer = await call('GET', `${ROUTES.meetings}?period=past&limit=5`, { token });

    expect(answer.status).toBe(HTTP_STATUS.ServiceUnavailable);
  });

  it('answers a meeting with its agenda, documents and participants', async () => {
    const { call, signIn } = aServer();
    const token = await signIn();

    const answer = await call('GET', ROUTES.meeting('meeting-1'), { token });

    expect(answer.status).toBe(HTTP_STATUS.Ok);
    expect(Object.keys(answer.body ?? {}).sort()).toEqual(
      ['agenda', 'documents', 'id', 'location', 'participants', 'scheduledAt', 'title'].sort(),
    );
  });

  it('answers 404 for a meeting that does not exist and 403 for one the user is not invited to', async () => {
    const { call, signIn, load } = aServer();
    load({
      meetings: [
        { ...aMeetingWithAgenda(), participants: aMeetingWithAgenda().participants.slice(1) },
      ],
      recordedVotes: [],
    });
    const token = await signIn();

    expect((await call('GET', ROUTES.meeting('nowhere'), { token })).status).toBe(
      HTTP_STATUS.NotFound,
    );
    const forbidden = await call('GET', ROUTES.meeting('meeting-1'), { token });
    expect(forbidden.status).toBe(HTTP_STATUS.Forbidden);
    expect(forbidden.body).toEqual({ error: { code: API_ERROR_CODE.Forbidden } });
  });

  it('answers 404, not 400, for an id the domain does not accept', async () => {
    const { call, signIn } = aServer();
    const token = await signIn();

    expect((await call('GET', ROUTES.meeting('%20'), { token })).status).toBe(HTTP_STATUS.NotFound);
    expect((await call('GET', ROUTES.document('x'.repeat(200)), { token })).status).toBe(
      HTTP_STATUS.NotFound,
    );
    expect((await call('GET', ROUTES.documentContent(' '), { token })).status).toBe(
      HTTP_STATUS.NotFound,
    );
  });

  it('reads an id that is percent-encoded', async () => {
    const { call, signIn, load } = aServer();
    load({ meetings: [{ ...aMeetingWithAgenda(), id: 'a/b c' as never }], recordedVotes: [] });
    const token = await signIn();

    const answer = await call('GET', ROUTES.meeting('a/b c'), { token });

    expect(answer.status).toBe(HTTP_STATUS.Ok);
    expect(answer.body?.id).toBe('a/b c');
  });

  it('answers a document', async () => {
    const { call, signIn } = aServer();
    const token = await signIn();

    const document = await call('GET', ROUTES.document('document-1'), { token });

    expect(document.body).toEqual({
      id: 'document-1',
      title: 'Financial statements',
      confidentiality: 'confidential',
      pageCount: 3,
    });
  });

  describe('the content of a document', () => {
    it('is the file itself, as application/pdf, with one page for each page of the document', async () => {
      const { call, signIn } = aServer();
      const token = await signIn();

      const content = await call('GET', ROUTES.documentContent('document-1'), { token });

      expect(content.status).toBe(HTTP_STATUS.Ok);
      expect(content.contentType).toBe('application/pdf');
      expect(hasPdfSignature(content.bytes)).toBe(true);
      expect(content.text).toContain('/Count 3');
      expect(content.text).toContain('(Financial statements) Tj');
    });

    it('is not to be stored by anything between the server and the app, and carries the version as its ETag', async () => {
      const { call, signIn } = aServer();
      const token = await signIn();

      const content = await call('GET', ROUTES.documentContent('document-1'), { token });

      expect(content.cacheControl).toBe('no-store');
      expect(content.etag).toMatch(/^"[^"]+"$/);
    });

    it('has the same version while the content of the server is the same, and another once it changed', async () => {
      const { call, signIn, load } = aServer();
      const token = await signIn();
      const first = await call('GET', ROUTES.documentContent('document-1'), { token });
      const again = await call('GET', ROUTES.documentContent('document-1'), { token });

      load({ meetings: [aMeetingWithAgenda()], recordedVotes: [] });
      const replaced = await call('GET', ROUTES.documentContent('document-1'), { token });

      expect(again.etag).toBe(first.etag);
      expect(replaced.etag).not.toBe(first.etag);
    });

    it('is refused without a token, like the metadata', async () => {
      const { call } = aServer();

      const content = await call('GET', ROUTES.documentContent('document-1'));

      expect(content.status).toBe(HTTP_STATUS.Unauthorized);
      expect(content.body).toEqual({ error: { code: API_ERROR_CODE.Unauthorized } });
      expect(content.contentType).toBe('application/json');
    });

    it('is refused for a document that does not exist', async () => {
      const { call, signIn } = aServer();
      const token = await signIn();

      const content = await call('GET', ROUTES.documentContent('nowhere'), { token });

      expect(content.status).toBe(HTTP_STATUS.NotFound);
      expect(content.body).toEqual({ error: { code: API_ERROR_CODE.NotFound } });
    });

    it('is refused while the simulated network is cut', async () => {
      const { call, signIn, network } = aServer();
      const token = await signIn();
      network.setOnline(false);

      const content = await call('GET', ROUTES.documentContent('document-1'), { token });

      expect(content.status).toBe(HTTP_STATUS.ServiceUnavailable);
    });
  });

  it('answers 404 and 403 for documents like for meetings', async () => {
    const { call, signIn, load } = aServer();
    load({
      meetings: [
        { ...aMeetingWithAgenda(), participants: aMeetingWithAgenda().participants.slice(1) },
      ],
      recordedVotes: [],
    });
    const token = await signIn();

    expect((await call('GET', ROUTES.document('nowhere'), { token })).status).toBe(
      HTTP_STATUS.NotFound,
    );
    expect((await call('GET', ROUTES.document('document-1'), { token })).status).toBe(
      HTTP_STATUS.Forbidden,
    );
    expect((await call('GET', ROUTES.documentContent('document-1'), { token })).status).toBe(
      HTTP_STATUS.Forbidden,
    );
  });
});

describe('MockApi, casting a vote', () => {
  it('records a vote and answers 204 with no body, again for the same vote, and 422 for another choice', async () => {
    const { call, signIn, backend } = aServer();
    const token = await signIn();

    const first = await call('POST', ROUTES.votes, { token, ...voteRequest() });
    const again = await call('POST', ROUTES.votes, {
      token,
      ...voteRequest(aVote({ castAt: (aVote().castAt + 5) as never })),
    });
    const other = await call('POST', ROUTES.votes, {
      token,
      ...voteRequest(aVote({ choice: VOTE_CHOICE.Against })),
    });

    expect(first).toMatchObject({ status: HTTP_STATUS.NoContent, text: '' });
    expect(again.status).toBe(HTTP_STATUS.NoContent);
    expect(other.status).toBe(HTTP_STATUS.UnprocessableContent);
    expect(other.body).toEqual({
      error: { code: VOTING_ERROR_CODE.AlreadyVoted, source: 'recorded' },
    });
    expect(backend.recordedVotes()).toHaveLength(1);
  });

  it('answers 422 with the rule that refused it, for each business rule', async () => {
    const { call, signIn } = aServer();
    const token = await signIn();

    const unknown = await call('POST', ROUTES.votes, {
      token,
      ...voteRequest(aVote({ resolutionId: 'nowhere' as never })),
    });

    expect(unknown.status).toBe(HTTP_STATUS.UnprocessableContent);
    expect(unknown.body).toEqual({
      error: { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: 'nowhere' },
    });
  });

  it('answers 401 to a vote whose voter is not the user of the token, and records nothing', async () => {
    const { call, signIn, backend } = aServer();
    const token = await signIn();

    const answer = await call('POST', ROUTES.votes, {
      token,
      ...voteRequest(aVote({ voterId: 'user-2' as never })),
    });

    expect(answer.status).toBe(HTTP_STATUS.Unauthorized);
    expect(backend.recordedVotes()).toEqual([]);
  });

  it.each([
    ['text that is not JSON', { rawBody: 'nope' }],
    ['a body that is not a vote', { body: { choice: 'for' } }],
    ['a choice nobody knows', { body: { ...toVoteRequestWire(aVote()), choice: 'maybe' } }],
    ['a missing idempotency key', { body: toVoteRequestWire(aVote()) }],
    [
      'an idempotency key that is not the one of the vote',
      { body: toVoteRequestWire(aVote()), headers: { [HTTP_HEADER.IdempotencyKey]: 'forged' } },
    ],
    [
      'an idempotency key that is malformed',
      { body: toVoteRequestWire(aVote()), headers: { [HTTP_HEADER.IdempotencyKey]: '%E0%A4%A' } },
    ],
  ])('answers 400 for %s', async (_name, options) => {
    const { call, signIn, backend } = aServer();
    const token = await signIn();

    const answer = await call('POST', ROUTES.votes, { token, ...options });

    expect(answer.status).toBe(HTTP_STATUS.BadRequest);
    expect(backend.recordedVotes()).toEqual([]);
  });

  it('reads the key of the vote in a header that is percent-encoded', async () => {
    const { call, signIn, load } = aServer();
    load({
      meetings: [aMeetingWithAgenda()],
      recordedVotes: [],
    });
    const token = await signIn();
    const vote = aVote();

    const answer = await call('POST', ROUTES.votes, {
      token,
      body: toVoteRequestWire(vote),
      headers: { [HTTP_HEADER.IdempotencyKey]: encodeURIComponent(vote.idempotencyKey) },
    });

    expect(vote.idempotencyKey).toBe('12.resolution-1.user-1');
    expect(answer.status).toBe(HTTP_STATUS.NoContent);
  });

  it('answers 503 when the simulated server is unreachable, and records nothing', async () => {
    const { call, signIn, network, backend } = aServer();
    const token = await signIn();
    network.setOnline(false);

    const answer = await call('POST', ROUTES.votes, { token, ...voteRequest() });

    expect(answer.status).toBe(HTTP_STATUS.ServiceUnavailable);
    expect(backend.recordedVotes()).toEqual([]);
  });
});
