import { findResolution } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import type { Vote } from '@domain/entities/Vote';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
} from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_DAY,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aResolution,
  aResolutionId,
  aUserId,
  anAgendaItem,
  anAgendaItemId,
  aVote,
  unwrap,
} from '@domain/testing/builders';
import type { UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import { parseInstant } from '@domain/value-objects/Instant';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';

import type { MeetingRepository } from '../../ports/MeetingRepository';

import { mutable, mutableArray, valueOf } from './support';

/**
 * What a repository needs to be tested for the contract: a way to make the server hold given
 * meetings, to cut and restore the connection, and to have the caller refused. Each adapter
 * provides it with whatever its own set-up is.
 */
export interface MeetingRepositoryHarness {
  readonly repository: MeetingRepository;
  /**
   * The instant the server takes for the present. A meeting scheduled after it is upcoming, any
   * other is past: the server decides, the suite only dates its meetings from here.
   */
  readonly now: Instant;
  /**
   * Makes the server hold exactly these meetings, all of them visible to the signed-in user, and
   * forgets the ones it held. They are served in the order given.
   */
  serve(meetings: readonly Meeting[]): void | Promise<void>;
  /**
   * Makes the server hold this meeting as one the signed-in user may not see (they are not
   * invited): the meeting exists, and is refused to them.
   */
  forbid(meeting: Meeting): void | Promise<void>;
  /** Makes the server hold this vote as recorded, for its voter. */
  recordVote(vote: Vote): void | Promise<void>;
  /** From now on the requests are authenticated as this user, who is invited to the served meetings. */
  signInAs(userId: UserId): void | Promise<void>;
  setOnline(online: boolean): void;
  /** From now on the server refuses the caller: no valid credentials. */
  refuseCaller(): void | Promise<void>;
}

export interface MeetingRepositoryContractOptions {
  /**
   * Whether the server shows each user their own recorded votes on the resolutions of a meeting.
   * The scripted server of the fakes returns the meetings it was given, and cannot.
   */
  readonly projectsRecordedVotes: boolean;
}

export type MeetingRepositoryFactory = () =>
  MeetingRepositoryHarness | Promise<MeetingRepositoryHarness>;

const UNKNOWN_MEETING = aMeetingId('does-not-exist');

/**
 * The contract of `MeetingRepository`, as a suite any implementation runs: the two lists are
 * ordered as documented and cut to the size asked for, a cursor continues where the page ended,
 * a list holds summaries, an unknown meeting is `notFound`, the failures are `Result`s.
 */
export function describeMeetingRepositoryContract(
  name: string,
  createHarness: MeetingRepositoryFactory,
  options: MeetingRepositoryContractOptions,
): void {
  describe(`${name} honours the MeetingRepository contract`, () => {
    let harness: MeetingRepositoryHarness;
    let repository: MeetingRepository;

    /** A meeting scheduled `days` days from the present of the server. */
    function meetingIn(id: string, days: number): Meeting {
      return aMeeting({
        summary: aMeetingSummary({
          id: aMeetingId(id),
          title: `Meeting ${id}`,
          scheduledAt: unwrap(parseInstant(harness.now + days * MILLIS_PER_DAY)),
        }),
        // Resolution ids are unique across meetings: each meeting has its own.
        agenda: [
          anAgendaItem({
            id: anAgendaItemId(`agenda-${id}`),
            resolution: aResolution({ id: aResolutionId(`resolution-${id}`) }),
          }),
        ],
      });
    }

    const summaryOf = (meeting: Meeting): MeetingSummary => ({
      id: meeting.id,
      title: meeting.title,
      scheduledAt: meeting.scheduledAt,
      location: meeting.location,
    });

    const request = (limit: number, cursor?: PageCursor) =>
      unwrap(createPageRequest(cursor === undefined ? { limit } : { limit, cursor }));

    async function idsOf(period: MeetingPeriod, limit: number, cursor?: PageCursor) {
      const page = valueOf(await repository.list(period, request(limit, cursor)));
      return { ids: page.items.map(({ id }) => id as string), nextCursor: page.nextCursor };
    }

    beforeEach(async () => {
      harness = await createHarness();
      repository = harness.repository;
    });

    describe('list', () => {
      it('puts upcoming meetings soonest first, whatever the order the server holds them in', async () => {
        await harness.serve([
          meetingIn('u3', 3),
          meetingIn('u1', 1),
          meetingIn('u4', 4),
          meetingIn('u2', 2),
        ]);

        expect((await idsOf(MEETING_PERIOD.Upcoming, 10)).ids).toEqual(['u1', 'u2', 'u3', 'u4']);
      });

      it('puts past meetings latest first, whatever the order the server holds them in', async () => {
        await harness.serve([meetingIn('p2', -2), meetingIn('p3', -3), meetingIn('p1', -1)]);

        expect((await idsOf(MEETING_PERIOD.Past, 10)).ids).toEqual(['p1', 'p2', 'p3']);
      });

      it('lists a meeting under its period only', async () => {
        await harness.serve([meetingIn('u1', 1), meetingIn('p1', -1), meetingIn('u2', 2)]);

        expect((await idsOf(MEETING_PERIOD.Upcoming, 10)).ids).toEqual(['u1', 'u2']);
        expect((await idsOf(MEETING_PERIOD.Past, 10)).ids).toEqual(['p1']);
      });

      it('lists summaries: what a list shows, and nothing of the agenda, documents or participants', async () => {
        const meeting = meetingIn('u1', 1);
        await harness.serve([meeting]);

        const page = valueOf(await repository.list(MEETING_PERIOD.Upcoming, request(10)));

        expect(page.items).toStrictEqual([summaryOf(meeting)]);
      });

      it('gives an empty page, without a cursor, for a period without meetings', async () => {
        await harness.serve([meetingIn('u1', 1)]);

        const page = valueOf(await repository.list(MEETING_PERIOD.Past, request(5)));

        expect(page.items).toEqual([]);
        expect(page.nextCursor).toBeUndefined();
      });

      it('cuts a page to the size asked for, and gives a cursor only when there is more', async () => {
        await harness.serve([
          meetingIn('u1', 1),
          meetingIn('u2', 2),
          meetingIn('u3', 3),
          meetingIn('u4', 4),
        ]);

        const two = await idsOf(MEETING_PERIOD.Upcoming, 2);
        const one = await idsOf(MEETING_PERIOD.Upcoming, 1);
        const exactly = await idsOf(MEETING_PERIOD.Upcoming, 4);
        const more = await idsOf(MEETING_PERIOD.Upcoming, 50);

        expect(two.ids).toEqual(['u1', 'u2']);
        expect(two.nextCursor).toBeDefined();
        expect(one.ids).toEqual(['u1']);
        expect(one.nextCursor).toBeDefined();
        expect(exactly.ids).toEqual(['u1', 'u2', 'u3', 'u4']);
        expect(exactly.nextCursor).toBeUndefined();
        expect(more.ids).toEqual(['u1', 'u2', 'u3', 'u4']);
        expect(more.nextCursor).toBeUndefined();
      });

      it.each([1, 2, 3, 5])(
        'walks the whole list with a page size of %s, seeing each meeting once and in order',
        async (limit) => {
          const upcoming = [1, 2, 3, 4, 5, 6, 7].map((day) => meetingIn(`u${day}`, day));
          const past = [1, 2, 3, 4, 5].map((day) => meetingIn(`p${day}`, -day));
          await harness.serve([...upcoming.slice().reverse(), ...past]);

          for (const [period, expected] of [
            [MEETING_PERIOD.Upcoming, upcoming.map(({ id }) => id as string)],
            [MEETING_PERIOD.Past, past.map(({ id }) => id as string)],
          ] as const) {
            const seen: string[] = [];
            let cursor: PageCursor | undefined;
            let pages = 0;
            do {
              const page = await idsOf(period, limit, cursor);
              seen.push(...page.ids);
              cursor = page.nextCursor;
              pages += 1;
            } while (cursor !== undefined && pages <= expected.length);

            expect(seen).toEqual(expected);
          }
        },
      );

      it('continues a list after the cursor of the page before it, and ends it with no cursor', async () => {
        await harness.serve([meetingIn('u1', 1), meetingIn('u2', 2), meetingIn('u3', 3)]);

        const first = await idsOf(MEETING_PERIOD.Upcoming, 2);
        const second = await idsOf(MEETING_PERIOD.Upcoming, 2, first.nextCursor);

        expect(second.ids).toEqual(['u3']);
        expect(second.nextCursor).toBeUndefined();
      });

      it('answers the same page to the same request', async () => {
        await harness.serve([meetingIn('u1', 1), meetingIn('u2', 2), meetingIn('u3', 3)]);

        const first = await idsOf(MEETING_PERIOD.Upcoming, 2);
        const again = await idsOf(MEETING_PERIOD.Upcoming, 2);

        expect(again).toEqual(first);
      });
    });

    describe('get', () => {
      it('returns the meeting with its agenda, documents and participants', async () => {
        const meeting = meetingIn('u1', 1);
        await harness.serve([meeting, meetingIn('p1', -1)]);

        expect(await repository.get(meeting.id)).toStrictEqual(ok(meeting));
      });

      it('answers notFound for a meeting the server does not hold', async () => {
        await harness.serve([meetingIn('u1', 1)]);

        expect(await repository.get(UNKNOWN_MEETING)).toStrictEqual(err(notFound()));
      });

      it('answers notFound for a meeting the server no longer holds', async () => {
        await harness.serve([meetingIn('u1', 1)]);
        await harness.serve([]);

        expect(await repository.get(aMeetingId('u1'))).toStrictEqual(err(notFound()));
      });
    });

    describe('what it returns', () => {
      it('is a copy: changing a meeting or a page that was returned changes nothing the next call returns', async () => {
        const meeting = meetingIn('u1', 1);
        await harness.serve([meeting]);
        const returned = valueOf(await repository.get(meeting.id));
        const page = valueOf(await repository.list(MEETING_PERIOD.Upcoming, request(5)));

        mutable(returned).title = 'DEFACED';
        mutableArray(returned.agenda).length = 0;
        mutableArray(returned.participants).length = 0;
        for (const item of page.items) mutable(item).title = 'DEFACED';
        mutableArray(page.items).length = 0;

        expect(await repository.get(meeting.id)).toStrictEqual(ok(meeting));
        const again = valueOf(await repository.list(MEETING_PERIOD.Upcoming, request(5)));
        expect(again.items).toStrictEqual([summaryOf(meeting)]);
      });
    });

    // A server that returns what it was given (the fakes) skips these: they show as skipped.
    (options.projectsRecordedVotes ? describe : describe.skip)('the votes of the user', () => {
      const MEETING_WITH_VOTE = aMeeting();
      const vote = aVote();

      it('shows the user the vote they recorded on a resolution', async () => {
        await harness.serve([MEETING_WITH_VOTE]);
        await harness.recordVote(vote);

        const returned = valueOf(await repository.get(MEETING_WITH_VOTE.id));

        expect(findResolution(returned, vote.resolutionId)?.recordedVote).toBe(vote.choice);
      });

      it('shows it to nobody else: another user of the same meeting sees no vote', async () => {
        await harness.serve([MEETING_WITH_VOTE]);
        await harness.recordVote(vote);

        await harness.signInAs(aUserId('user-2'));
        const returned = valueOf(await repository.get(MEETING_WITH_VOTE.id));

        expect(findResolution(returned, vote.resolutionId)?.recordedVote).toBeUndefined();
      });

      it('shows no vote on a resolution nobody voted on', async () => {
        await harness.serve([MEETING_WITH_VOTE]);

        const returned = valueOf(await repository.get(MEETING_WITH_VOTE.id));

        expect(findResolution(returned, vote.resolutionId)?.recordedVote).toBeUndefined();
      });
    });

    describe('a meeting the user may not see', () => {
      it('is refused with forbidden: the session is valid, the item is not theirs', async () => {
        const hidden = meetingIn('hidden', 1);
        await harness.serve([meetingIn('u1', 2)]);
        await harness.forbid(hidden);

        expect(await repository.get(hidden.id)).toStrictEqual(err(forbidden()));
      });

      it('is not told apart from the session being refused: that one is unauthorized', async () => {
        const hidden = meetingIn('hidden', 1);
        await harness.serve([]);
        await harness.forbid(hidden);
        await harness.refuseCaller();

        expect(await repository.get(hidden.id)).toStrictEqual(err(unauthorized()));
      });

      it('is not listed, and does not hide the meetings that are theirs', async () => {
        await harness.serve([meetingIn('u1', 1), meetingIn('u2', 2)]);
        await harness.forbid(meetingIn('hidden', 1));

        expect((await idsOf(MEETING_PERIOD.Upcoming, 10)).ids).toEqual(['u1', 'u2']);
        expect((await repository.get(aMeetingId('u1'))).ok).toBe(true);
      });
    });

    describe('failures are results', () => {
      beforeEach(async () => {
        await harness.serve([meetingIn('u1', 1)]);
      });

      it('answers networkUnavailable without a connection, and recovers with it', async () => {
        harness.setOnline(false);

        expect(await repository.list(MEETING_PERIOD.Upcoming, request(5))).toStrictEqual(
          err(networkUnavailable()),
        );
        expect(await repository.get(aMeetingId('u1'))).toStrictEqual(err(networkUnavailable()));

        harness.setOnline(true);
        expect((await idsOf(MEETING_PERIOD.Upcoming, 5)).ids).toEqual(['u1']);
        expect((await repository.get(aMeetingId('u1'))).ok).toBe(true);
      });

      it('answers unauthorized when the caller is refused', async () => {
        await harness.refuseCaller();

        expect(await repository.list(MEETING_PERIOD.Upcoming, request(5))).toStrictEqual(
          err(unauthorized()),
        );
        expect(await repository.get(aMeetingId('u1'))).toStrictEqual(err(unauthorized()));
      });
    });
  });
}
