import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { findResolution } from '@domain/entities/Meeting';
import { idempotencyKeyOf } from '@domain/entities/Vote';
import {
  REPOSITORY_ERROR_CODE,
  forbidden,
  notFound,
  unauthorized,
} from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_DAY,
  MILLIS_PER_HOUR,
  aConfidentialDocument,
  aDuration,
  aDocument,
  aDocumentId,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aMeetingWithAgenda,
  aParticipant,
  aResolution,
  aResolutionId,
  anAgendaItem,
  anAgendaItemId,
  aUser,
  aUserId,
  aVote,
  at,
  unwrap,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { parsePageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { hasPdfSignature } from '../pdf/pdfSignature';
import { recordingSleep } from '../testing/sleep';

import { InMemoryBackend, SERVER_CONTENT_ERROR_CODE } from './InMemoryBackend';
import { TEST_PASSWORD, createTestServer } from '../testing/testServer';

const BRUNO = aUser({ id: aUserId('user-2') });
const OUTSIDER = aUserId('user-9');

const request = (limit: number, cursor?: string) =>
  unwrap(
    createPageRequest(
      cursor === undefined ? { limit } : { limit, cursor: unwrap(parsePageCursor(cursor)) },
    ),
  );

/** A meeting with one resolution, of the given id. */
function meetingAtWithResolution(id: string, resolutionId: string) {
  return aMeeting({
    summary: aMeetingSummary({
      id: aMeetingId(id),
      title: `Meeting ${id}`,
      scheduledAt: at(MILLIS_PER_DAY),
    }),
    agenda: [
      anAgendaItem({
        id: anAgendaItemId(`agenda-${id}`),
        resolution: aResolution({ id: aResolutionId(resolutionId) }),
      }),
    ],
  });
}

function meetingAt(id: string, millisFromNow: number, participants = [aParticipant()]) {
  return aMeeting({
    summary: aMeetingSummary({
      id: aMeetingId(id),
      title: `Meeting ${id}`,
      scheduledAt: at(millisFromNow),
    }),
    // Resolution ids are unique across meetings, and these meetings need no agenda.
    agenda: [],
    participants,
  });
}

describe('InMemoryBackend', () => {
  describe('who sees what', () => {
    it('lists to a user the meetings they take part in only', async () => {
      const server = createTestServer({
        content: {
          meetings: [
            meetingAt('mine', MILLIS_PER_DAY),
            meetingAt('theirs', 2 * MILLIS_PER_DAY, [
              aParticipant({ userId: aUserId('user-2'), fullName: 'Bruno Durand' }),
            ]),
          ],
          recordedVotes: [],
        },
      });

      const mine = await server.meetings.list(MEETING_PERIOD.Upcoming, request(10));
      server.auth.openSessionFor(BRUNO);
      const theirs = await server.meetings.list(MEETING_PERIOD.Upcoming, request(10));

      expect(mine.ok && mine.value.items.map(({ id }) => id)).toEqual(['mine']);
      expect(theirs.ok && theirs.value.items.map(({ id }) => id)).toEqual(['theirs']);
    });

    it('refuses a meeting the user is not invited to with forbidden, and one that does not exist with notFound', async () => {
      const server = createTestServer({
        content: { meetings: [meetingAt('mine', MILLIS_PER_DAY)], recordedVotes: [] },
      });
      server.auth.openSessionFor(aUser({ id: OUTSIDER }));

      expect(await server.meetings.get(aMeetingId('mine'))).toStrictEqual(err(forbidden()));
      expect(await server.meetings.get(aMeetingId('unknown'))).toStrictEqual(err(notFound()));
    });

    it('refuses a document of a meeting the user is not part of with forbidden, one that no meeting lists with notFound', async () => {
      const hidden = aConfidentialDocument({ id: aDocumentId('hidden') });
      const server = createTestServer();
      server.load({
        meetings: [
          aMeeting({
            summary: aMeetingSummary({ id: aMeetingId('theirs') }),
            agenda: [],
            documents: [hidden],
            participants: [aParticipant({ userId: aUserId('user-2') })],
          }),
          aMeeting({ documents: [aDocument()] }),
        ],
        recordedVotes: [],
      });

      expect(await server.documents.get(hidden.id)).toStrictEqual(err(forbidden()));
      expect(await server.documents.fetchContent(hidden.id)).toStrictEqual(err(forbidden()));
      expect(await server.documents.get(aDocumentId('unknown'))).toStrictEqual(err(notFound()));
      expect((await server.documents.get(aDocument().id)).ok).toBe(true);
    });

    it('lets a document that two meetings list be had by a user who is in one of them', async () => {
      const shared = aDocument({ id: aDocumentId('shared') });
      const server = createTestServer();
      server.load({
        meetings: [
          aMeeting({
            summary: aMeetingSummary({ id: aMeetingId('theirs') }),
            agenda: [],
            documents: [shared],
            participants: [aParticipant({ userId: aUserId('user-2') })],
          }),
          aMeeting({ documents: [shared] }),
        ],
        recordedVotes: [],
      });

      expect((await server.documents.get(shared.id)).ok).toBe(true);
    });

    it('treats a session whose expiry has passed as no session: unauthorized', async () => {
      const server = createTestServer();

      server.clock.advance(MILLIS_PER_HOUR);

      expect(await server.meetings.get(aMeetingId())).toStrictEqual(err(unauthorized()));
      expect(await server.meetings.list(MEETING_PERIOD.Upcoming, request(5))).toStrictEqual(
        err(unauthorized()),
      );
      expect(await server.votes.submit(aVote())).toStrictEqual(err(unauthorized()));
    });

    it('serves whoever signs in next with their own view', async () => {
      const server = createTestServer({ signedIn: false });
      const [alice, bruno] = server.accounts;
      await server.auth.signIn({ email: alice.user.email, password: TEST_PASSWORD });
      expect(await server.votes.submit(aVote())).toStrictEqual(ok(undefined));

      await server.auth.signIn({ email: bruno.user.email, password: TEST_PASSWORD });

      expect(await server.votes.submit(aVote())).toStrictEqual(err(unauthorized()));
    });
  });

  describe('the content it accepts', () => {
    const twinOf = (id: string) => meetingAtWithResolution(id, 'resolution-shared');

    it('refuses, on creation, two meetings that share a resolution id: resolution ids are globally unique', () => {
      const server = createTestServer();

      const created = InMemoryBackend.create({
        clock: server.clock,
        auth: server.auth,
        network: server.network,
        content: { meetings: [twinOf('first'), twinOf('second')], recordedVotes: [] },
      });

      expect(created).toStrictEqual(
        err({
          code: SERVER_CONTENT_ERROR_CODE.DuplicateResolutionId,
          resolutionId: aResolutionId('resolution-shared'),
        }),
      );
    });

    it('refuses the same on a replacement, and keeps what it held', async () => {
      const server = createTestServer();
      await server.votes.submit(aVote());

      const replaced = server.backend.replaceContent({
        meetings: [twinOf('first'), twinOf('second')],
        recordedVotes: [],
      });

      expect(replaced.ok).toBe(false);
      expect(!replaced.ok && replaced.error.code).toBe(
        SERVER_CONTENT_ERROR_CODE.DuplicateResolutionId,
      );
      expect((await server.meetings.get(aMeetingId())).ok).toBe(true);
      expect(server.backend.recordedVotes()).toHaveLength(1);
    });

    it('accepts meetings with distinct resolution ids, and a meeting without resolutions', () => {
      const server = createTestServer();

      expect(
        server.backend.replaceContent({
          meetings: [
            twinOf('first'),
            meetingAtWithResolution('second', 'resolution-other'),
            meetingAt('third', 0),
          ],
          recordedVotes: [],
        }).ok,
      ).toBe(true);
    });

    it('does not take a vote held for another meeting under the same key for the vote it is sent', async () => {
      // Cannot happen with unique resolution ids; the safeguard is that it is not acknowledged.
      const server = createTestServer({
        content: {
          meetings: [aMeetingWithAgenda()],
          recordedVotes: [aVote({ meetingId: aMeetingId('another-meeting') })],
        },
      });

      const result = await server.votes.submit(aVote());

      expect(result.ok).toBe(false);
      expect(server.backend.recordedVotes()).toHaveLength(1);
    });
  });

  describe('the requests it validates', () => {
    it.each([0, -1, 51, 1.5, Number.NaN])(
      'refuses a page limit of %s, which the domain does not accept',
      async (limit) => {
        const server = createTestServer();

        const result = await server.meetings.list(MEETING_PERIOD.Upcoming, { limit });

        expect(!result.ok && result.error.code).toBe(REPOSITORY_ERROR_CODE.Unexpected);
      },
    );

    it.each([
      ['an exponent', '1e3:a'],
      ['a hexadecimal instant', '0x10:a'],
      ['a space after the instant', '5 :a'],
      ['a negative instant', '-5:a'],
      ['a leading zero', '05:a'],
      ['a fractional instant', '5.5:a'],
      ['an extra segment', '5:a:b'],
      ['an empty id', '5:'],
      ['no separator', '5'],
      ['no instant', ':a'],
      ['an instant too large to be exact', '99999999999999999999:a'],
      ['a malformed escape sequence', '5:%E0%A4%A'],
    ])('refuses a cursor with %s', async (_name, cursor) => {
      const server = createTestServer();

      const result = await server.meetings.list(MEETING_PERIOD.Upcoming, request(5, cursor));

      expect(!result.ok && result.error.code).toBe(REPOSITORY_ERROR_CODE.Unexpected);
    });

    it('reads the cursors it writes back, for ids that contain the separator and other special characters', async () => {
      const ids = ['a:b', 'c/d', 'e%20f', 'g h'];
      const server = createTestServer({
        content: {
          meetings: ids.map((id, index) => meetingAt(id, (index + 1) * MILLIS_PER_DAY)),
          recordedVotes: [],
        },
      });

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await server.meetings.list(MEETING_PERIOD.Upcoming, request(1, cursor));
        if (!page.ok) throw new Error('the list failed');
        seen.push(...page.value.items.map(({ id }) => id));
        cursor = page.value.nextCursor;
      } while (cursor !== undefined);

      expect(seen).toEqual(ids);
    });
  });

  describe('the identity of a request', () => {
    /** A server whose latency lets the test change the world while a request is on its way. */
    function slowServer(options: Parameters<typeof createTestServer>[0] = {}) {
      const hooks: { whileWaiting: () => void } = { whileWaiting: () => undefined };
      const server = createTestServer({
        ...options,
        sleep: () => Promise.resolve(hooks.whileWaiting()),
      });
      server.network.setLatency(aDuration(1));
      return { server, hooks };
    }

    it('is the one read when the request was created: a vote is recorded for the user who cast it', async () => {
      const { server, hooks } = slowServer();
      hooks.whileWaiting = () => {
        server.auth.openSessionFor(BRUNO);
      };

      const result = await server.votes.submit(aVote());

      expect(result).toStrictEqual(ok(undefined));
      expect(server.backend.recordedVotes().map((vote) => vote.voterId)).toEqual([aUserId()]);
    });

    it('never answers with the view of a user who signed in while it was on its way', async () => {
      const { server, hooks } = slowServer({
        content: {
          meetings: [
            aMeetingWithAgenda({
              participants: [
                aParticipant(),
                aParticipant({ userId: aUserId('user-2'), fullName: 'Bruno Durand' }),
              ],
            }),
          ],
          recordedVotes: [aVote({ choice: VOTE_CHOICE.Against })],
        },
      });
      hooks.whileWaiting = () => {
        server.auth.openSessionFor(BRUNO);
      };

      const meeting = await server.meetings.get(aMeetingId());

      expect(meeting.ok && findResolution(meeting.value, aResolutionId())?.recordedVote).toBe(
        VOTE_CHOICE.Against,
      );
    });

    it('refuses a request created when nobody was signed in, though somebody signs in meanwhile', async () => {
      const { server, hooks } = slowServer({ signedIn: false });
      hooks.whileWaiting = () => {
        server.auth.openSessionFor(aUser());
      };

      expect(await server.votes.submit(aVote())).toStrictEqual(err(unauthorized()));
      expect(server.backend.recordedVotes()).toEqual([]);
    });

    it('answers unauthorized to nobody signed in even without a connection: the client has no token to send', async () => {
      const server = createTestServer({ signedIn: false });
      server.network.setOnline(false);

      expect(await server.meetings.get(aMeetingId())).toStrictEqual(err(unauthorized()));
    });
  });

  describe('the downloads', () => {
    it('are located per user: two users never share a location', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });
      const first = await server.documents.fetchContent(aDocument().id);
      server.auth.openSessionFor(BRUNO);
      const second = await server.documents.fetchContent(aDocument().id);

      expect(first.ok && second.ok && first.value !== second.value).toBe(true);
    });

    it('are located per version of the content: serving the content again changes the location', async () => {
      const content = { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] };
      const server = createTestServer({ content });
      const first = await server.documents.fetchContent(aDocument().id);
      server.load(content);
      const second = await server.documents.fetchContent(aDocument().id);

      expect(first.ok && second.ok && first.value !== second.value).toBe(true);
    });

    it('are located by encoded parts, so that ids that contain a separator cannot share a location', async () => {
      const first = aDocument({ id: aDocumentId('a/b') });
      const second = aDocument({ id: aDocumentId('a%2Fb') });
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [first, second] })], recordedVotes: [] },
      });

      const locations = [
        await server.documents.fetchContent(first.id),
        await server.documents.fetchContent(second.id),
      ];

      expect(locations.every((location) => location.ok)).toBe(true);
      expect(new Set(locations.map((location) => location.ok && location.value)).size).toBe(2);
    });
  });

  describe('the lists', () => {
    it('puts a meeting scheduled at the very instant of the clock among the past ones', async () => {
      const server = createTestServer({
        content: { meetings: [meetingAt('now', 0), meetingAt('later', 1)], recordedVotes: [] },
      });

      const upcoming = await server.meetings.list(MEETING_PERIOD.Upcoming, request(5));
      const past = await server.meetings.list(MEETING_PERIOD.Past, request(5));

      expect(upcoming.ok && upcoming.value.items.map(({ id }) => id)).toEqual(['later']);
      expect(past.ok && past.value.items.map(({ id }) => id)).toEqual(['now']);
    });

    it('moves a meeting to the past list when the clock passes it, and keeps a cursor valid meanwhile', async () => {
      const server = createTestServer({
        content: {
          meetings: [
            meetingAt('u1', MILLIS_PER_DAY),
            meetingAt('u2', 2 * MILLIS_PER_DAY),
            meetingAt('u3', 3 * MILLIS_PER_DAY),
          ],
          recordedVotes: [],
        },
      });
      const first = await server.meetings.list(MEETING_PERIOD.Upcoming, request(1));
      const cursor = first.ok ? first.value.nextCursor : undefined;

      // The first meeting begins while the user is reading the first page.
      server.clock.advance(MILLIS_PER_DAY + 1);
      server.auth.openSessionFor(aUser());
      const second = await server.meetings.list(MEETING_PERIOD.Upcoming, {
        limit: 1,
        ...(cursor === undefined ? {} : { cursor }),
      });

      expect(second.ok && second.value.items.map(({ id }) => id)).toEqual(['u2']);
    });

    it('answers unexpected, with a cause free of any query value, to a cursor it did not build', async () => {
      const server = createTestServer();

      const result = await server.meetings.list(MEETING_PERIOD.Upcoming, request(5, 'garbage'));

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe(REPOSITORY_ERROR_CODE.Unexpected);
      expect(JSON.stringify(result)).not.toContain('garbage');
    });

    it('answers an empty page for a cursor past the end of the list', async () => {
      const server = createTestServer({
        content: { meetings: [meetingAt('u1', MILLIS_PER_DAY)], recordedVotes: [] },
      });

      const result = await server.meetings.list(
        MEETING_PERIOD.Upcoming,
        request(5, `${at(10 * MILLIS_PER_DAY)}:zzz`),
      );

      expect(result).toStrictEqual(ok({ items: [] }));
    });

    it('breaks a tie between two meetings at the same instant by id, so a page boundary between them is stable', async () => {
      const server = createTestServer({
        content: {
          meetings: [meetingAt('b', MILLIS_PER_DAY), meetingAt('a', MILLIS_PER_DAY)],
          recordedVotes: [],
        },
      });

      const first = await server.meetings.list(MEETING_PERIOD.Upcoming, request(1));
      const cursor = first.ok ? first.value.nextCursor : undefined;
      const second = await server.meetings.list(MEETING_PERIOD.Upcoming, {
        limit: 1,
        ...(cursor === undefined ? {} : { cursor }),
      });

      expect(first.ok && first.value.items.map(({ id }) => id)).toEqual(['a']);
      expect(second.ok && second.value.items.map(({ id }) => id)).toEqual(['b']);
    });
  });

  describe('votes', () => {
    it('shows the user the vote they recorded on the resolution, and nobody else', async () => {
      const server = createTestServer({
        content: {
          meetings: [
            aMeetingWithAgenda({
              participants: [
                aParticipant(),
                aParticipant({ userId: aUserId('user-2'), fullName: 'Bruno Durand' }),
              ],
            }),
          ],
          recordedVotes: [],
        },
      });
      await server.votes.submit(aVote({ choice: VOTE_CHOICE.Against }));

      const mine = await server.meetings.get(aMeetingId());
      server.auth.openSessionFor(BRUNO);
      const theirs = await server.meetings.get(aMeetingId());

      expect(mine.ok && findResolution(mine.value, aResolutionId())?.recordedVote).toBe(
        VOTE_CHOICE.Against,
      );
      expect(theirs.ok && findResolution(theirs.value, aResolutionId())?.recordedVote).toBe(
        undefined,
      );
    });

    it('shows the votes it was seeded with to their voter', async () => {
      const seeded = aVote({ choice: VOTE_CHOICE.Abstain });
      const server = createTestServer({
        content: { meetings: [aMeetingWithAgenda()], recordedVotes: [seeded] },
      });

      const meeting = await server.meetings.get(aMeetingId());

      expect(meeting.ok && findResolution(meeting.value, aResolutionId())?.recordedVote).toBe(
        VOTE_CHOICE.Abstain,
      );
      expect(await server.votes.submit(aVote({ choice: VOTE_CHOICE.For }))).toStrictEqual(
        err({ code: 'alreadyVoted', source: 'recorded' }),
      );
    });

    it('stamps the vote with its own time, never the castAt of the device', async () => {
      const server = createTestServer();
      server.clock.advance(1234);

      await server.votes.submit(aVote({ castAt: at(-5 * MILLIS_PER_DAY) }));

      expect(server.backend.recordedVotes().map((vote) => vote.castAt)).toEqual([at(1234)]);
    });

    it('records the vote under the key it derives, not the one the device sent', async () => {
      const server = createTestServer();
      const forged = {
        ...aVote(),
        idempotencyKey: aVote({ resolutionId: aResolutionId('forged') }).idempotencyKey,
      };

      await server.votes.submit(forged);
      const again = await server.votes.submit(forged);

      expect(again).toStrictEqual(ok(undefined));
      expect(server.backend.recordedVotes().map((vote) => vote.idempotencyKey)).toEqual([
        idempotencyKeyOf(aResolutionId(), aUserId()),
      ]);
    });

    it('is shared by the repositories: replacing the content forgets the votes', async () => {
      const server = createTestServer();
      await server.votes.submit(aVote());

      server.load({ meetings: [aMeetingWithAgenda()], recordedVotes: [] });

      expect(server.backend.recordedVotes()).toEqual([]);
      expect(await server.votes.submit(aVote({ choice: VOTE_CHOICE.Against }))).toStrictEqual(
        ok(undefined),
      );
    });
  });

  describe('content', () => {
    it('writes the content of a downloaded document to the files of the device, as a PDF', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });

      const location = await server.documents.fetchContent(aDocument().id);

      const name = location.ok ? server.files.nameOf(location.value) : undefined;
      expect(name).toBeDefined();
      expect(await server.files.stat(name ?? '')).toMatchObject({
        ok: true,
        value: { size: expect.any(Number) as number },
      });
    });

    it('does not store anything when the download fails', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });
      server.network.setOnline(false);

      const location = await server.documents.fetchContent(aDocument().id);

      expect(location.ok).toBe(false);
      expect(await server.files.list()).toStrictEqual(ok([]));
    });

    it('serves a PDF with the pages of the document, made for the user and the version', async () => {
      const server = createTestServer({
        content: {
          meetings: [
            aMeeting({ documents: [aDocument({ title: 'Annual report', pageCount: 7 })] }),
          ],
          recordedVotes: [],
        },
      });

      const served = await server.backend.fetchDocumentContent(aDocument().id);

      expect(served.ok && hasPdfSignature(served.value.bytes)).toBe(true);
      expect(served.ok && served.value.userId).toBe(aUserId());
      expect(served.ok && String.fromCharCode(...served.value.bytes)).toContain('/Count 7');
    });

    it('serves another version when the content is replaced, and the same one while it is not', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });
      const first = await server.backend.fetchDocumentContent(aDocument().id);
      const again = await server.backend.fetchDocumentContent(aDocument().id);

      server.load({ meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] });
      const replaced = await server.backend.fetchDocumentContent(aDocument().id);

      expect(first.ok && again.ok && again.value.version).toBe(first.ok && first.value.version);
      expect(replaced.ok && first.ok && replaced.value.version).not.toBe(
        first.ok && first.value.version,
      );
    });

    it('serves no content for a document that is not there', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });

      expect(await server.backend.fetchDocumentContent(aDocumentId('nowhere'))).toStrictEqual(
        err(notFound()),
      );
    });

    it('hands out copies: changing an answer does not change the server', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });
      const meeting = await server.meetings.get(aMeetingId());
      const page = await server.meetings.list(MEETING_PERIOD.Upcoming, request(5));
      const document = await server.documents.get(aDocument().id);

      if (meeting.ok) {
        (meeting.value as { title: string }).title = 'DEFACED';
        (meeting.value.participants as unknown[]).length = 0;
      }
      if (page.ok) (page.value.items as unknown[]).length = 0;
      if (document.ok) (document.value as { title: string }).title = 'DEFACED';

      const again = await server.meetings.get(aMeetingId());
      expect(again.ok && again.value.title).toBe(aMeeting().title);
      expect(again.ok && again.value.participants).toHaveLength(aMeeting().participants.length);
      expect((await server.documents.get(aDocument().id)).ok).toBe(true);
      const documentAgain = await server.documents.get(aDocument().id);
      expect(documentAgain.ok && documentAgain.value.title).toBe(aDocument().title);
      expect(documentAgain.ok && documentAgain.value.confidentiality).toBe(
        CONFIDENTIALITY_LEVEL.Internal,
      );
    });

    it('copies the content it is given: changing it afterwards does not change the server', async () => {
      const meeting = aMeeting();
      const server = createTestServer({ content: { meetings: [meeting], recordedVotes: [] } });

      (meeting as { title: string }).title = 'DEFACED';

      const held = await server.meetings.get(aMeetingId());
      expect(held.ok && held.value.title).toBe(aMeeting().title);
    });
  });

  describe('the network', () => {
    it('waits for the latency once per request, through the sleep it was given', async () => {
      const { sleep, requested } = recordingSleep();
      const server = createTestServer({ sleep });
      server.network.setLatency(aDuration(300));

      await server.meetings.list(MEETING_PERIOD.Upcoming, request(5));
      await server.meetings.get(aMeetingId());
      await server.votes.submit(aVote());

      expect(requested).toEqual([300, 300, 300]);
    });

    it('is the network every client of the server goes through: going offline cuts them all', async () => {
      const server = createTestServer();
      server.backend.network.setOnline(false);

      const results = [
        await server.meetings.get(aMeetingId()),
        await server.votes.submit(aVote()),
        await server.auth.signIn({ email: server.accounts[0].user.email, password: TEST_PASSWORD }),
      ];

      expect(results.map((result) => !result.ok && result.error.code)).toEqual([
        'networkUnavailable',
        'networkUnavailable',
        'networkUnavailable',
      ]);
    });
  });
});
