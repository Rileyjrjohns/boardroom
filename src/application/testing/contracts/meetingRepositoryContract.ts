import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import { networkUnavailable, notFound, unauthorized } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import {
  MILLIS_PER_DAY,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  unwrap,
} from '@domain/testing/builders';
import type { Instant } from '@domain/value-objects/Instant';
import { parseInstant } from '@domain/value-objects/Instant';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';

import type { MeetingRepository } from '../../ports/MeetingRepository';

import { valueOf } from './support';

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
  setOnline(online: boolean): void;
  /** From now on the server refuses the caller: no valid credentials. */
  refuseCaller(): void | Promise<void>;
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
