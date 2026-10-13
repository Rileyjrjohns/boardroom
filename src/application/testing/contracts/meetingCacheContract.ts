import type { AgendaItem } from '@domain/entities/AgendaItem';
import type { Meeting } from '@domain/entities/Meeting';
import type { Participant } from '@domain/entities/Participant';
import { ok } from '@domain/shared/Result';
import {
  NOW,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aUserId,
  at,
  unwrap,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPage } from '@domain/value-objects/Page';
import { parsePageCursor } from '@domain/value-objects/PageCursor';

import type { MeetingCache, MeetingPageKey } from '../../ports/MeetingCache';

import { mutable, mutableArray } from './support';

export type MeetingCacheFactory = () => MeetingCache | Promise<MeetingCache>;

const OWNER = aUserId('owner-1');
const OTHER_OWNER = aUserId('owner-2');

const PAGE_KEY: MeetingPageKey = { period: MEETING_PERIOD.Upcoming, limit: 20 };

const MEETING = aMeeting();
const OTHER_MEETING = aMeeting({
  summary: aMeetingSummary({ id: aMeetingId('meeting-2'), title: 'Audit committee' }),
});

const PAGE = createPage(
  [aMeetingSummary(), aMeetingSummary({ id: aMeetingId('meeting-2'), title: 'Audit committee' })],
  unwrap(parsePageCursor('meeting-2')),
);
const OTHER_PAGE = createPage([aMeetingSummary({ id: aMeetingId('meeting-9') })]);

const DEFACED = 'DEFACED';

/** Changes a meeting in place, at every depth, the way a careless caller could. */
function deface(meeting: Meeting): void {
  mutable(meeting).title = DEFACED;
  for (const item of meeting.agenda) mutable<AgendaItem>(item).title = DEFACED;
  for (const participant of meeting.participants)
    mutable<Participant>(participant).fullName = DEFACED;
  mutableArray(meeting.agenda).length = 0;
  mutableArray(meeting.documents).length = 0;
}

/**
 * The contract of `MeetingCache`, as a suite any implementation runs. Everything it checks is
 * written in the port: owners are kept apart, a miss is a value, `save` replaces, `remove` and
 * `purge` succeed when there is nothing to remove, and the store keeps no reference to the objects
 * that go in or out. The factory returns a fresh, empty cache.
 */
export function describeMeetingCacheContract(name: string, createCache: MeetingCacheFactory): void {
  describe(`${name} honours the MeetingCache contract`, () => {
    let cache: MeetingCache;

    beforeEach(async () => {
      cache = await createCache();
    });

    it('answers a miss with a successful undefined, never an error', async () => {
      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
    });

    it('gives back a meeting as it was saved, with the instant it was saved at', async () => {
      expect(await cache.saveMeeting(OWNER, MEETING, at(10))).toStrictEqual(ok(undefined));

      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
        ok({ value: MEETING, cachedAt: at(10) }),
      );
    });

    it('gives back a page as it was saved, with its cursor, or without one on the last page', async () => {
      const lastPage = createPage([aMeetingSummary()]);
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      await cache.savePage(OWNER, { ...PAGE_KEY, period: MEETING_PERIOD.Past }, lastPage, at(21));

      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
        ok({ value: PAGE, cachedAt: at(20) }),
      );
      expect(
        await cache.readPage(OWNER, { ...PAGE_KEY, period: MEETING_PERIOD.Past }),
      ).toStrictEqual(ok({ value: lastPage, cachedAt: at(21) }));
    });

    it('replaces what is stored under the same owner and key, and the instant with it', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.saveMeeting(OWNER, { ...MEETING, title: 'Renamed' }, at(11));
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      await cache.savePage(OWNER, PAGE_KEY, OTHER_PAGE, at(21));

      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
        ok({ value: { ...MEETING, title: 'Renamed' }, cachedAt: at(11) }),
      );
      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
        ok({ value: OTHER_PAGE, cachedAt: at(21) }),
      );
    });

    it('tells meetings apart by id', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.saveMeeting(OWNER, OTHER_MEETING, at(11));

      expect(await cache.readMeeting(OWNER, OTHER_MEETING.id)).toStrictEqual(
        ok({ value: OTHER_MEETING, cachedAt: at(11) }),
      );
      expect(await cache.readMeeting(OWNER, aMeetingId('meeting-3'))).toStrictEqual(ok(undefined));
    });

    it('tells pages apart by period, by cursor and by page size', async () => {
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      const cursor = unwrap(parsePageCursor('meeting-2'));

      for (const key of [
        { ...PAGE_KEY, period: MEETING_PERIOD.Past },
        { ...PAGE_KEY, limit: 21 },
        { ...PAGE_KEY, cursor },
      ]) {
        expect(await cache.readPage(OWNER, key)).toStrictEqual(ok(undefined));
      }
      await cache.savePage(OWNER, { ...PAGE_KEY, cursor }, OTHER_PAGE, at(21));
      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
        ok({ value: PAGE, cachedAt: at(20) }),
      );
    });

    it('keeps the entries of two owners apart: an owner reads a miss where another saved', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));

      expect(await cache.readMeeting(OTHER_OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      expect(await cache.readPage(OTHER_OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
    });

    it('does not let one owner overwrite, or remove, the entry of another', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      await cache.saveMeeting(OTHER_OWNER, OTHER_MEETING, at(11));
      await cache.saveMeeting(OTHER_OWNER, { ...MEETING, title: 'Theirs' }, at(12));
      await cache.savePage(OTHER_OWNER, PAGE_KEY, OTHER_PAGE, at(21));

      await cache.removeMeeting(OTHER_OWNER, MEETING.id);
      await cache.removePage(OTHER_OWNER, PAGE_KEY);

      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
        ok({ value: MEETING, cachedAt: at(10) }),
      );
      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
        ok({ value: PAGE, cachedAt: at(20) }),
      );
      expect(await cache.readMeeting(OTHER_OWNER, OTHER_MEETING.id)).toStrictEqual(
        ok({ value: OTHER_MEETING, cachedAt: at(11) }),
      );
    });

    it('removes one entry and leaves the others, and succeeds when the entry is absent', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.saveMeeting(OWNER, OTHER_MEETING, at(11));
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      await cache.savePage(OWNER, { ...PAGE_KEY, limit: 5 }, OTHER_PAGE, at(21));

      expect(await cache.removeMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      expect(await cache.removeMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      expect(await cache.removePage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
      expect(await cache.removePage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
      expect(await cache.removeMeeting(OTHER_OWNER, MEETING.id)).toStrictEqual(ok(undefined));

      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
      expect(await cache.readMeeting(OWNER, OTHER_MEETING.id)).toStrictEqual(
        ok({ value: OTHER_MEETING, cachedAt: at(11) }),
      );
      expect(await cache.readPage(OWNER, { ...PAGE_KEY, limit: 5 })).toStrictEqual(
        ok({ value: OTHER_PAGE, cachedAt: at(21) }),
      );
    });

    it('purges every entry of every owner, and succeeds when there is none', async () => {
      expect(await cache.purge()).toStrictEqual(ok(undefined));
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.saveMeeting(OTHER_OWNER, OTHER_MEETING, at(11));
      await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
      await cache.savePage(OTHER_OWNER, PAGE_KEY, OTHER_PAGE, at(21));

      expect(await cache.purge()).toStrictEqual(ok(undefined));

      for (const owner of [OWNER, OTHER_OWNER]) {
        expect(await cache.readMeeting(owner, MEETING.id)).toStrictEqual(ok(undefined));
        expect(await cache.readMeeting(owner, OTHER_MEETING.id)).toStrictEqual(ok(undefined));
        expect(await cache.readPage(owner, PAGE_KEY)).toStrictEqual(ok(undefined));
      }
      expect(await cache.purge()).toStrictEqual(ok(undefined));
    });

    it('can be used again after a purge', async () => {
      await cache.saveMeeting(OWNER, MEETING, at(10));
      await cache.purge();
      await cache.saveMeeting(OWNER, MEETING, at(30));

      expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
        ok({ value: MEETING, cachedAt: at(30) }),
      );
    });

    describe('keeps no reference to the objects that go in or out', () => {
      it('is not changed by a change of the meeting after it was saved', async () => {
        const saved = aMeeting();
        await cache.saveMeeting(OWNER, saved, NOW);

        deface(saved);

        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: NOW }),
        );
      });

      it('is not changed by a change of the page after it was saved', async () => {
        const saved = createPage([aMeetingSummary()], unwrap(parsePageCursor('meeting-1')));
        await cache.savePage(OWNER, PAGE_KEY, saved, NOW);

        for (const item of saved.items) mutable(item).title = DEFACED;
        mutableArray(saved.items).length = 0;
        mutable(saved).nextCursor = unwrap(parsePageCursor(DEFACED));

        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
          ok({
            value: createPage([aMeetingSummary()], unwrap(parsePageCursor('meeting-1'))),
            cachedAt: NOW,
          }),
        );
      });

      it('is not changed by a change of the meeting after it was read', async () => {
        await cache.saveMeeting(OWNER, MEETING, NOW);
        const read = await cache.readMeeting(OWNER, MEETING.id);

        if (read.ok && read.value !== undefined) {
          deface(read.value.value);
          mutable(read.value).cachedAt = at(999);
        }

        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: NOW }),
        );
      });

      it('is not changed by a change of the page after it was read', async () => {
        await cache.savePage(OWNER, PAGE_KEY, PAGE, NOW);
        const read = await cache.readPage(OWNER, PAGE_KEY);

        if (read.ok && read.value !== undefined) {
          for (const item of read.value.value.items) mutable(item).title = DEFACED;
          mutableArray(read.value.value.items).length = 0;
        }

        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
          ok({ value: PAGE, cachedAt: NOW }),
        );
      });

      it('hands out a new object at every read', async () => {
        await cache.saveMeeting(OWNER, MEETING, NOW);

        const first = await cache.readMeeting(OWNER, MEETING.id);
        const second = await cache.readMeeting(OWNER, MEETING.id);

        expect(first.ok && second.ok && first.value?.value === second.value?.value).toBe(false);
      });
    });
  });
}
