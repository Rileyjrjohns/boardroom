import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { findResolution } from '@domain/entities/Meeting';
import { idempotencyKeyOf } from '@domain/entities/Vote';
import { REPOSITORY_ERROR_CODE, notFound, unauthorized } from '@domain/errors/RepositoryError';
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
  aResolutionId,
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

import { recordingSleep } from '../testing/sleep';
import { TEST_PASSWORD, createTestServer } from '../testing/testServer';

const BRUNO = aUser({ id: aUserId('user-2') });
const OUTSIDER = aUserId('user-9');

const request = (limit: number, cursor?: string) =>
  unwrap(
    createPageRequest(
      cursor === undefined ? { limit } : { limit, cursor: unwrap(parsePageCursor(cursor)) },
    ),
  );

function meetingAt(id: string, millisFromNow: number, participants = [aParticipant()]) {
  return aMeeting({
    summary: aMeetingSummary({
      id: aMeetingId(id),
      title: `Meeting ${id}`,
      scheduledAt: at(millisFromNow),
    }),
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

    it('answers notFound for a meeting the user is not invited to: it does not exist for them', async () => {
      const server = createTestServer({
        content: { meetings: [meetingAt('mine', MILLIS_PER_DAY)], recordedVotes: [] },
      });
      server.auth.openSessionFor(aUser({ id: OUTSIDER }));

      expect(await server.meetings.get(aMeetingId('mine'))).toStrictEqual(err(notFound()));
    });

    it('hides a document the same way: only documents of a meeting the user takes part in exist', async () => {
      const hidden = aConfidentialDocument({ id: aDocumentId('hidden') });
      const server = createTestServer();
      server.backend.replaceContent({
        meetings: [
          aMeeting({
            summary: aMeetingSummary({ id: aMeetingId('theirs') }),
            documents: [hidden],
            participants: [aParticipant({ userId: aUserId('user-2') })],
          }),
          aMeeting({ documents: [aDocument()] }),
        ],
        recordedVotes: [],
      });

      expect(await server.documents.get(hidden.id)).toStrictEqual(err(notFound()));
      expect(await server.documents.fetchContent(hidden.id)).toStrictEqual(err(notFound()));
      expect((await server.documents.get(aDocument().id)).ok).toBe(true);
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

      server.backend.replaceContent({ meetings: [aMeetingWithAgenda()], recordedVotes: [] });

      expect(server.backend.recordedVotes()).toEqual([]);
      expect(await server.votes.submit(aVote({ choice: VOTE_CHOICE.Against }))).toStrictEqual(
        ok(undefined),
      );
    });
  });

  describe('content', () => {
    it('stores the location of a downloaded document among the files of the device', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });

      const location = await server.documents.fetchContent(aDocument().id);

      expect(location.ok && server.files.has(location.value)).toBe(true);
    });

    it('does not store anything when the download fails', async () => {
      const server = createTestServer({
        content: { meetings: [aMeeting({ documents: [aDocument()] })], recordedVotes: [] },
      });
      server.network.goOffline();

      const location = await server.documents.fetchContent(aDocument().id);

      expect(location.ok).toBe(false);
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
      server.backend.network.goOffline();

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
