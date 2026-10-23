import { TRICKY_IDS, mutable, mutableArray } from '@core/application/testing/contracts/support';
import type { StoreContractOptions } from '@core/application/testing/contracts/support';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import { createPage } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import type { AgendaItem } from '@features/meetings/domain/entities/AgendaItem';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { Participant } from '@features/meetings/domain/entities/Participant';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import {
  NOW,
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aUserId,
  at,
  unwrap,
} from '@testing/domain/builders';

import type { MeetingCache, MeetingPageKey } from '../../ports/MeetingCache';

/**
 * What the suite needs besides the port: a way to make the store refuse writes (a full disk, a
 * database that is locked) and to let it write again.
 */
export interface MeetingCacheHarness {
  readonly cache: MeetingCache;
  /** From now on every `savePage` and `saveMeeting` fails with a storage error. */
  breakWrites(): void;
  repairWrites(): void;
  /**
   * Makes the next statement the store sends to its storage fail, once. Only a store that has a
   * storage to fail provides it (`StoreContractOptions.failsStatements`).
   */
  failNextStatement?(): void;
  /**
   * Closes the store and opens it again on the same storage, as a new start of the app would, and
   * returns the new one. Only a store whose content survives provides it
   * (`StoreContractOptions.survivesReopen`).
   */
  reopen?(): Promise<MeetingCache>;
}

export type MeetingCacheFactory = () => MeetingCacheHarness | Promise<MeetingCacheHarness>;

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
export function describeMeetingCacheContract(
  name: string,
  createCache: MeetingCacheFactory,
  options: StoreContractOptions,
): void {
  describe(`${name} honours the MeetingCache contract`, () => {
    let harness: MeetingCacheHarness;
    let cache: MeetingCache;

    beforeEach(async () => {
      harness = await createCache();
      cache = harness.cache;
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

    describe('a save that fails', () => {
      it('does not leave the older meeting readable as if it were current', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        harness.breakWrites();

        const failed = await cache.saveMeeting(OWNER, { ...MEETING, title: 'Newer' }, at(11));
        harness.repairWrites();

        expect(failed.ok).toBe(false);
        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      });

      it('does not leave the older page readable as if it were current', async () => {
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
        harness.breakWrites();

        const failed = await cache.savePage(OWNER, PAGE_KEY, OTHER_PAGE, at(21));
        harness.repairWrites();

        expect(failed.ok).toBe(false);
        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
      });

      it('leaves the other entries, and the entries of other owners, alone', async () => {
        await cache.saveMeeting(OWNER, OTHER_MEETING, at(10));
        await cache.saveMeeting(OTHER_OWNER, MEETING, at(11));
        await cache.saveMeeting(OWNER, MEETING, at(12));
        harness.breakWrites();

        await cache.saveMeeting(OWNER, { ...MEETING, title: 'Newer' }, at(13));
        harness.repairWrites();

        expect(await cache.readMeeting(OWNER, OTHER_MEETING.id)).toStrictEqual(
          ok({ value: OTHER_MEETING, cachedAt: at(10) }),
        );
        expect(await cache.readMeeting(OTHER_OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(11) }),
        );
      });

      it('saves again once the store works', async () => {
        harness.breakWrites();
        await cache.saveMeeting(OWNER, MEETING, at(10));
        harness.repairWrites();

        expect(await cache.saveMeeting(OWNER, MEETING, at(11))).toStrictEqual(ok(undefined));
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(11) }),
        );
      });
    });

    describe('the storage key is injective in the owner and the id', () => {
      const meetingOf = (id: string, title: string) =>
        aMeeting({ summary: aMeetingSummary({ id: aMeetingId(id), title }) });

      it('never mixes up two pairs of (owner, meeting id), whatever characters they contain', async () => {
        const pairs = TRICKY_IDS.flatMap((owner) => TRICKY_IDS.map((id) => [owner, id] as const));
        for (const [owner, id] of pairs) {
          await cache.saveMeeting(
            aUserId(owner),
            meetingOf(id, JSON.stringify([owner, id])),
            at(1),
          );
        }

        for (const [owner, id] of pairs) {
          const read = await cache.readMeeting(aUserId(owner), aMeetingId(id));
          expect(read.ok && read.value?.value.title).toBe(JSON.stringify([owner, id]));
        }
      });

      it('never mixes up two pairs of (owner, cursor), whatever characters they contain', async () => {
        // A cursor is trimmed by the domain, so those that differ only by their edges are one cursor.
        const cursors = TRICKY_IDS.filter((cursor) => cursor.trim() === cursor);
        const pairs = TRICKY_IDS.flatMap((owner) =>
          cursors.map((cursor) => [owner, cursor] as const),
        );
        const keyOf = (cursor: string): MeetingPageKey => ({
          ...PAGE_KEY,
          cursor: unwrap(parsePageCursor(cursor)),
        });
        for (const [owner, cursor] of pairs) {
          const page = createPage([aMeetingSummary({ title: JSON.stringify([owner, cursor]) })]);
          await cache.savePage(aUserId(owner), keyOf(cursor), page, at(1));
        }

        for (const [owner, cursor] of pairs) {
          const read = await cache.readPage(aUserId(owner), keyOf(cursor));
          expect(read.ok && read.value?.value.items[0]?.title).toBe(
            JSON.stringify([owner, cursor]),
          );
        }
      });

      it('does not merge an owner with a prefix of another, nor a meeting id with a prefix of another', async () => {
        await cache.saveMeeting(aUserId('owner'), meetingOf('meeting', 'short'), at(1));
        await cache.saveMeeting(aUserId('owner-2'), meetingOf('meeting', 'owner-2'), at(1));
        await cache.saveMeeting(aUserId('owner'), meetingOf('meeting-2', 'longer'), at(1));

        const read = await cache.readMeeting(aUserId('owner'), aMeetingId('meeting'));

        expect(read.ok && read.value?.value.title).toBe('short');
      });
    });

    // A store without a storage to fail, or with nothing to reopen, skips these: they show as skipped.
    (options.failsStatements ? describe : describe.skip)('a statement that fails', () => {
      const failNext = () => {
        if (harness.failNextStatement === undefined)
          throw new Error('The harness cannot fail a statement.');
        harness.failNextStatement();
      };

      it('turns a read that fails into a storage error, and finds the entry again afterwards', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));

        failNext();
        const failedMeeting = await cache.readMeeting(OWNER, MEETING.id);
        failNext();
        const failedPage = await cache.readPage(OWNER, PAGE_KEY);

        expect(!failedMeeting.ok && failedMeeting.error.code).toBe(STORAGE_ERROR_CODE.ReadFailed);
        expect(!failedPage.ok && failedPage.error.code).toBe(STORAGE_ERROR_CODE.ReadFailed);
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(10) }),
        );
        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
          ok({ value: PAGE, cachedAt: at(20) }),
        );
      });

      it('turns a save that fails into a storage error, and leaves no older entry readable', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
        await cache.saveMeeting(OWNER, OTHER_MEETING, at(11));

        failNext();
        const failedMeeting = await cache.saveMeeting(
          OWNER,
          { ...MEETING, title: 'Newer' },
          at(12),
        );
        failNext();
        const failedPage = await cache.savePage(OWNER, PAGE_KEY, OTHER_PAGE, at(21));

        expect(!failedMeeting.ok && failedMeeting.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(!failedPage.ok && failedPage.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
        expect(await cache.readMeeting(OWNER, OTHER_MEETING.id)).toStrictEqual(
          ok({ value: OTHER_MEETING, cachedAt: at(11) }),
        );
      });

      it('turns a removal that fails into a storage error, and keeps the entry', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));

        failNext();
        const failedMeeting = await cache.removeMeeting(OWNER, MEETING.id);
        failNext();
        const failedPage = await cache.removePage(OWNER, PAGE_KEY);

        expect(!failedMeeting.ok && failedMeeting.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(!failedPage.ok && failedPage.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(10) }),
        );
        expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(
          ok({ value: PAGE, cachedAt: at(20) }),
        );
      });

      it('turns a purge that fails into a storage error, and keeps every entry, none half removed', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.savePage(OTHER_OWNER, PAGE_KEY, PAGE, at(20));

        failNext();
        const failed = await cache.purge();

        expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(10) }),
        );
        expect(await cache.readPage(OTHER_OWNER, PAGE_KEY)).toStrictEqual(
          ok({ value: PAGE, cachedAt: at(20) }),
        );
        expect(await cache.purge()).toStrictEqual(ok(undefined));
      });

      it('fails once and no more: the next call works', async () => {
        failNext();
        await cache.saveMeeting(OWNER, MEETING, at(10));

        expect(await cache.saveMeeting(OWNER, MEETING, at(11))).toStrictEqual(ok(undefined));
        expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(11) }),
        );
      });
    });

    (options.survivesReopen ? describe : describe.skip)('closed and opened again', () => {
      const reopen = async (): Promise<MeetingCache> => {
        if (harness.reopen === undefined) throw new Error('The harness cannot reopen the store.');
        return harness.reopen();
      };

      it('gives back the meetings and the pages of every owner as they were, with their instants', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.saveMeeting(OTHER_OWNER, OTHER_MEETING, at(11));
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
        await cache.savePage(
          OTHER_OWNER,
          { ...PAGE_KEY, period: MEETING_PERIOD.Past },
          OTHER_PAGE,
          at(21),
        );

        const reopened = await reopen();

        expect(await reopened.readMeeting(OWNER, MEETING.id)).toStrictEqual(
          ok({ value: MEETING, cachedAt: at(10) }),
        );
        expect(await reopened.readMeeting(OTHER_OWNER, OTHER_MEETING.id)).toStrictEqual(
          ok({ value: OTHER_MEETING, cachedAt: at(11) }),
        );
        expect(await reopened.readPage(OWNER, PAGE_KEY)).toStrictEqual(
          ok({ value: PAGE, cachedAt: at(20) }),
        );
        expect(
          await reopened.readPage(OTHER_OWNER, { ...PAGE_KEY, period: MEETING_PERIOD.Past }),
        ).toStrictEqual(ok({ value: OTHER_PAGE, cachedAt: at(21) }));
        expect(await reopened.readMeeting(OTHER_OWNER, MEETING.id)).toStrictEqual(ok(undefined));
      });

      it('does not give back what was removed before it was closed', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.saveMeeting(OWNER, OTHER_MEETING, at(11));
        await cache.savePage(OWNER, PAGE_KEY, PAGE, at(20));
        await cache.removeMeeting(OWNER, MEETING.id);
        await cache.removePage(OWNER, PAGE_KEY);

        const reopened = await reopen();

        expect(await reopened.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
        expect(await reopened.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
        expect(await reopened.readMeeting(OWNER, OTHER_MEETING.id)).toStrictEqual(
          ok({ value: OTHER_MEETING, cachedAt: at(11) }),
        );
      });

      it('does not give back what was purged before it was closed', async () => {
        await cache.saveMeeting(OWNER, MEETING, at(10));
        await cache.savePage(OTHER_OWNER, PAGE_KEY, PAGE, at(20));
        await cache.purge();

        const reopened = await reopen();

        expect(await reopened.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
        expect(await reopened.readPage(OTHER_OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));
      });
    });

    describe('writers at the same time', () => {
      it('leaves one complete version of an entry when several saves of it run together', async () => {
        const versions = [1, 2, 3, 4, 5, 6].map((number) => ({
          meeting: { ...MEETING, title: `Version ${number}` },
          cachedAt: at(number),
        }));

        await Promise.all(
          versions.map(({ meeting, cachedAt }) => cache.saveMeeting(OWNER, meeting, cachedAt)),
        );

        const read = await cache.readMeeting(OWNER, MEETING.id);
        const held = read.ok ? read.value : undefined;
        expect(versions).toContainEqual({ meeting: held?.value, cachedAt: held?.cachedAt });
      });

      it('keeps every entry when saves of different keys run together', async () => {
        const meetings = [1, 2, 3, 4, 5].map((number) =>
          aMeeting({ summary: aMeetingSummary({ id: aMeetingId(`m-${number}`) }) }),
        );
        const keys = [5, 10, 15].map((limit) => ({ ...PAGE_KEY, limit }));

        await Promise.all([
          ...meetings.map((meeting, number) => cache.saveMeeting(OWNER, meeting, at(number))),
          ...keys.map((key) => cache.savePage(OWNER, key, PAGE, at(30))),
        ]);

        for (const [number, meeting] of meetings.entries()) {
          expect(await cache.readMeeting(OWNER, meeting.id)).toStrictEqual(
            ok({ value: meeting, cachedAt: at(number) }),
          );
        }
        for (const key of keys) {
          expect(await cache.readPage(OWNER, key)).toStrictEqual(
            ok({ value: PAGE, cachedAt: at(30) }),
          );
        }
      });

      it('leaves nothing, or one complete version, when a save, a removal and reads run together', async () => {
        const answers = await Promise.all([
          cache.saveMeeting(OWNER, MEETING, at(1)),
          cache.readMeeting(OWNER, MEETING.id),
          cache.removeMeeting(OWNER, MEETING.id),
          cache.saveMeeting(OWNER, { ...MEETING, title: 'Newer' }, at(2)),
          cache.readMeeting(OWNER, MEETING.id),
          cache.purge(),
        ]);

        expect(answers.every((answer) => answer.ok)).toBe(true);
        const read = await cache.readMeeting(OWNER, MEETING.id);
        const held = read.ok ? read.value : undefined;
        expect([undefined, 'Newer', MEETING.title]).toContain(held?.value.title);
      });
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
