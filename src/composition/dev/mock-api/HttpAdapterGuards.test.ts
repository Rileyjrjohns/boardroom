import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { err, ok } from '@core/domain/shared/Result';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import type { DocumentId, MeetingId } from '@core/domain/value-objects/ids';
import { HttpClient } from '@core/infrastructure/http/HttpClient';
import type { FetchFunction } from '@core/infrastructure/http/HttpClient';
import {
  HTTP_HEADER,
  HTTP_METHOD,
  HTTP_STATUS,
  MEDIA_TYPE_JSON,
  ROUTES,
} from '@core/infrastructure/http/protocol';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { IdempotencyKey } from '@features/votes/domain/entities/Vote';
import { HttpVoteRepository } from '@features/votes/infrastructure/HttpVoteRepository';
import { toVoteRequestWire } from '@features/votes/infrastructure/dto/voteDto';
import { NOW, aDuration, aResolutionId, aUserId, aVote, unwrap } from '@testing/domain/builders';
import { createHttpWorld, installMockApi, TEST_API_URL } from '@testing/infrastructure/httpWorld';
import { createTestServer } from '@testing/infrastructure/testServer';

import { MockApi } from './MockApi';

// The HTTP adapters promise never to throw or reject, whatever they are given. The identifiers and
// the cursor are checked by the domain, but an adapter does not rely on it: a value that cannot be
// put in an address (a lone surrogate, which `encodeURIComponent` refuses) is a failure, never an
// exception, and nothing is sent.

const installed = installMockApi();

/** Text that cannot be percent-encoded. */
const LONE_SURROGATE = '\uD800';

const CAUSE_NOT_BUILT = 'request could not be built';

describe('The HTTP adapters, given what cannot be put in an address', () => {
  it('answer unexpected, without sending anything, for a meeting that cannot be addressed', async () => {
    const { meetings, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    installed.received.length = 0;

    const answer = await meetings.get(LONE_SURROGATE as MeetingId);

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: CAUSE_NOT_BUILT }),
    );
    expect(installed.received).toEqual([]);
  });

  it('answer unexpected for a document and for its content that cannot be addressed', async () => {
    const { documents, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    installed.received.length = 0;

    const document = await documents.get(LONE_SURROGATE as DocumentId);
    const content = await documents.fetchContent(LONE_SURROGATE as DocumentId);

    const refused = err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: CAUSE_NOT_BUILT });
    expect(document).toStrictEqual(refused);
    expect(content).toStrictEqual(refused);
    expect(installed.received).toEqual([]);
  });

  it('answer unexpected for a page whose cursor cannot be put in the query', async () => {
    const { meetings, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    installed.received.length = 0;
    // The domain refuses such a cursor: this is a value that got past it.
    const request = {
      ...unwrap(createPageRequest({ limit: 10 })),
      cursor: LONE_SURROGATE,
    } as never;

    const answer = await meetings.list(MEETING_PERIOD.Upcoming, request);

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: CAUSE_NOT_BUILT }),
    );
    expect(installed.received).toEqual([]);
  });

  it('answer unexpected for a vote whose idempotency key cannot be put in a header', async () => {
    const { votes, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    installed.received.length = 0;
    const vote = { ...aVote(), idempotencyKey: LONE_SURROGATE as IdempotencyKey };

    const answer = await votes.submit(vote);

    expect(answer).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: CAUSE_NOT_BUILT }),
    );
    expect(installed.received).toEqual([]);
  });

  it('do not leak the value they were given', async () => {
    const world = await createHttpWorld(installed);
    await world.signInAs(aUserId('user-1'));

    const answer = await world.meetings.get(LONE_SURROGATE as MeetingId);

    expect(JSON.stringify(answer)).not.toContain('uD800');
    expect(JSON.stringify(answer)).not.toContain(LONE_SURROGATE);
  });
});

describe('HttpVoteRepository, a vote of a user who is no longer the signed-in one', () => {
  it('is not sent: the voter must be the user the token belongs to', async () => {
    const { votes, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    // Alice's vote is ready to go; then somebody else signs in on the device.
    const alices = aVote({ voterId: aUserId('user-1') });
    await signInAs(aUserId('user-2'));
    installed.received.length = 0;

    const answer = await votes.submit(alices);

    expect(answer).toStrictEqual(err({ code: REPOSITORY_ERROR_CODE.Unauthorized }));
    expect(installed.received).toEqual([]);
  });

  it('is sent when the voter is the signed-in user', async () => {
    const { votes, signInAs } = await createHttpWorld(installed);
    await signInAs(aUserId('user-1'));
    installed.received.length = 0;

    await votes.submit(aVote({ voterId: aUserId('user-1') }));

    expect(installed.received).toHaveLength(1);
  });
});

describe('HttpVoteRepository, a success whose body is not JSON', () => {
  /** A client over a `fetch` that answers what it is told, and whose body nobody may read. */
  function votesAnswered(status: number, text: () => Promise<string>) {
    const tokens = { token: () => Promise.resolve(ok({ token: 't', userId: aUserId('user-1') })) };
    const monitoring = new FakeMonitoring();
    const fetch: FetchFunction = () => Promise.resolve({ status, text });
    const client = new HttpClient({
      baseUrl: TEST_API_URL,
      timeout: aDuration(1000),
      tokens,
      monitoring,
      fetch,
    });
    return new HttpVoteRepository(client, monitoring);
  }

  it('is a success: the vote was recorded, whatever the body says', async () => {
    const votes = votesAnswered(201, () => Promise.resolve('<html>created</html>'));

    expect(await votes.submit(aVote())).toStrictEqual(ok(undefined));
  });

  it('is a success without reading the body at all', async () => {
    const read = jest.fn(() => Promise.reject(new Error('the body must not be read')));
    const votes = votesAnswered(204, read);

    expect(await votes.submit(aVote())).toStrictEqual(ok(undefined));
    expect(read).not.toHaveBeenCalled();
  });
});

describe('HttpVoteRepository, the idempotency key in a header', () => {
  /** Ids with every kind of character that is not safe in a header or a path. */
  const AWKWARD = [
    ['spaces and a slash', 'résolution 1/a', 'utilisateur 1'],
    ['a percent sign and a colon', '100%:ok', 'u%41:1'],
    ['a line break and a quote', 'r\r\nX-Injected: yes', 'u"1\''],
    ['letters outside ASCII', '決議1', 'ユーザー1'],
    ['an emoji, which is two code units', 'r\u{1F5F3}', 'u\u{1F464}'],
  ] as const;

  async function sentHeaders(resolution: string, voter: string) {
    const sent: Record<string, string>[] = [];
    const monitoring = new FakeMonitoring();
    const client = new HttpClient({
      baseUrl: TEST_API_URL,
      timeout: aDuration(1000),
      tokens: { token: () => Promise.resolve(ok({ token: 't', userId: aUserId(voter) })) },
      monitoring,
      fetch: (_url, init) => {
        sent.push({ ...init.headers });
        return Promise.resolve({ status: 204, text: () => Promise.resolve('') });
      },
    });
    const vote = aVote({ resolutionId: aResolutionId(resolution), voterId: aUserId(voter) });
    const answer = await new HttpVoteRepository(client, monitoring).submit(vote);
    return { vote, answer, headers: sent[0] };
  }

  it.each(AWKWARD)(
    'sends the key as ASCII that gives it back, for %s',
    async (_name, resolution, voter) => {
      const { vote, answer, headers } = await sentHeaders(resolution, voter);

      const key = headers?.[HTTP_HEADER.IdempotencyKey];
      expect(answer).toStrictEqual(ok(undefined));
      expect(key).toBe(encodeURIComponent(vote.idempotencyKey));
      expect(key).toMatch(/^[\x21-\x7E]+$/);
      expect(decodeURIComponent(key ?? '')).toBe(vote.idempotencyKey);
    },
  );

  it.each(AWKWARD)(
    'is accepted by the server as the key of the vote, for %s',
    async (_name, resolution, voter) => {
      const { vote, headers } = await sentHeaders(resolution, voter);
      const api = new MockApi({
        backend: createTestServer({ signedIn: false }).backend,
        clock: { now: () => NOW },
        accounts: [],
        sessionLifetime: aDuration(1000),
        generateToken: () => 't',
      });

      const answer = await api.handle(
        new Request(`${TEST_API_URL}${ROUTES.votes}`, {
          method: HTTP_METHOD.Post,
          headers: { ...headers, [HTTP_HEADER.ContentType]: MEDIA_TYPE_JSON },
          body: JSON.stringify(toVoteRequestWire(vote)),
        }),
      );

      // The key and the body agree: the request is refused for who sent it, not for being malformed.
      expect(answer.status).toBe(HTTP_STATUS.Unauthorized);
    },
  );
});
