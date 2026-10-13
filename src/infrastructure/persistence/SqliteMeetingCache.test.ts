import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { MeetingPageKey } from '@application/ports/MeetingCache';
import { describeMeetingCacheContract } from '@application/testing/contracts/meetingCacheContract';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { storageReadFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
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

import { toMeetingWire } from '../http/dto/meetingDto';

import { databaseDirectory, openTestDatabase } from '../testing/testDatabase';
import type { TestDatabase } from '../testing/testDatabase';

import { COLUMN, TABLE } from './schema';
import { SqliteMeetingCache } from './SqliteMeetingCache';

const directory = databaseDirectory();

/** The cache over a real SQLite database in a file, and what the contract suite needs to wreck it. */
function harnessOf(test: TestDatabase, monitoring = new FakeMonitoring()) {
  const cache = new SqliteMeetingCache({ database: test.database, monitoring });
  return {
    cache,
    // A full disk: nothing can be added, but space can still be freed.
    breakWrites: () => test.faults.failWhileAddingData(true),
    repairWrites: () => test.faults.failWhileAddingData(false),
    failNextStatement: () => test.faults.failNext(),
    reopen: async () => {
      const reopened = await test.reopen();
      return harnessOf(reopened, monitoring).cache;
    },
  };
}

describeMeetingCacheContract(
  'SqliteMeetingCache',
  async () => harnessOf(await openTestDatabase(directory)),
  { failsStatements: true, survivesReopen: true },
);

// What the contract cannot say: the rows are JSON that is checked when it is read back, and a row
// that does not pass is a miss, reported, and deleted.

function withStatus(status: string) {
  const wire = toMeetingWire(MEETING);
  return {
    ...wire,
    agenda: wire.agenda.map((item) =>
      item.resolution === undefined
        ? item
        : { ...item, resolution: { ...item.resolution, status } },
    ),
  };
}

const OWNER = aUserId('owner-1');
const MEETING = aMeeting();
const PAGE_KEY: MeetingPageKey = { period: MEETING_PERIOD.Upcoming, limit: 10 };

async function openCache() {
  const test = await openTestDatabase(directory);
  const monitoring = new FakeMonitoring();
  const cache = new SqliteMeetingCache({ database: test.database, monitoring });
  return { test, monitoring, cache };
}

describe('SqliteMeetingCache, on rows that no longer read back', () => {
  /** Overwrites the stored payload of the meeting, behind the back of the cache. */
  async function corrupt(payload: string) {
    const { test, monitoring, cache } = await openCache();
    await cache.saveMeeting(OWNER, MEETING, at(10));
    await test.database.run(`UPDATE ${TABLE.MeetingDetails} SET ${COLUMN.Payload} = ?`, [payload]);
    return { test, monitoring, cache };
  }

  const rowsLeft = async (test: TestDatabase) =>
    (await test.database.all(`SELECT count(*) AS total FROM ${TABLE.MeetingDetails}`))[0]?.total;

  it.each([
    ['text that is not JSON', 'not json at all'],
    ['JSON that is not the shape of a meeting', JSON.stringify({ id: 'meeting-1' })],
    ['a meeting whose status is not one', JSON.stringify(withStatus('archived'))],
    ['a meeting with a blank title', JSON.stringify({ ...toMeetingWire(MEETING), title: '   ' })],
  ])('reads %s as a miss, reports it, and deletes the row', async (_name, payload) => {
    const { test, monitoring, cache } = await corrupt(payload);

    expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));

    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowDiscarded]);
    expect(await rowsLeft(test)).toBe(0);
  });

  it('cannot be made to hold a payload that is NULL: the database refuses it', async () => {
    const { test, cache } = await openCache();
    await cache.saveMeeting(OWNER, MEETING, at(10));

    await expect(
      test.database.run(`UPDATE ${TABLE.MeetingDetails} SET ${COLUMN.Payload} = NULL`),
    ).rejects.toThrow();
  });

  it('reads a cached instant that is not an instant as a miss', async () => {
    const { test, monitoring, cache } = await openCache();
    await cache.saveMeeting(OWNER, MEETING, at(10));
    await test.database.run(`UPDATE ${TABLE.MeetingDetails} SET ${COLUMN.CachedAt} = -5`);

    expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));

    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowDiscarded]);
    expect(await rowsLeft(test)).toBe(0);
  });

  it('reports the places the payload broke the schema, never what it held', async () => {
    const wire = {
      ...toMeetingWire(MEETING),
      title: 'A secret title',
      scheduledAt: 'yesterday-ish',
    };
    const { monitoring, cache } = await corrupt(JSON.stringify(wire));

    await cache.readMeeting(OWNER, MEETING.id);

    const [captured] = monitoring.errors;
    expect(captured?.attributes).toEqual({
      [LOG_ATTRIBUTE.Resource]: 'meeting',
      [LOG_ATTRIBUTE.IssuePaths]: 'scheduledAt',
    });
    expect(JSON.stringify(monitoring.errors)).not.toContain('A secret title');
    expect(JSON.stringify(monitoring.errors)).not.toContain('yesterday-ish');
  });

  it('reads a page that no longer passes as a miss, reports it, and deletes the row', async () => {
    const { test, monitoring, cache } = await openCache();
    await cache.savePage(OWNER, PAGE_KEY, createPage([aMeetingSummary()]), at(10));
    await test.database.run(`UPDATE ${TABLE.MeetingPages} SET ${COLUMN.Payload} = ?`, [
      '{"items":3}',
    ]);

    expect(await cache.readPage(OWNER, PAGE_KEY)).toStrictEqual(ok(undefined));

    expect(monitoring.errors.map((captured) => captured.attributes)).toEqual([
      { [LOG_ATTRIBUTE.Resource]: 'meetingPage', [LOG_ATTRIBUTE.IssuePaths]: 'items' },
    ]);
    expect(await test.database.all(`SELECT * FROM ${TABLE.MeetingPages}`)).toEqual([]);
  });

  it('still returns the miss when the row cannot be deleted', async () => {
    const { test, cache } = await corrupt('not json at all');
    // The read finds the row, then the delete that follows fails.
    const database = test.database;
    const original = database.run.bind(database);
    jest
      .spyOn(database, 'run')
      .mockImplementation((sql, params) =>
        sql.startsWith('DELETE') ? Promise.reject(new Error('read only')) : original(sql, params),
      );

    expect(await cache.readMeeting(OWNER, MEETING.id)).toStrictEqual(ok(undefined));
  });

  it('keeps a good row next to a corrupted one', async () => {
    const { test, cache } = await corrupt('not json at all');
    const other = aMeeting({ summary: aMeetingSummary({ id: aMeetingId('meeting-2') }) });
    await cache.saveMeeting(OWNER, other, at(11));

    await cache.readMeeting(OWNER, MEETING.id);

    expect(await cache.readMeeting(OWNER, other.id)).toStrictEqual(
      ok({ value: other, cachedAt: at(11) }),
    );
    expect(await rowsLeft(test)).toBe(1);
  });
});

describe('SqliteMeetingCache, on a storage that does not answer', () => {
  it('turns every call into a storage error within the time it was given', async () => {
    const test = await openTestDatabase(directory);
    const cache = new SqliteMeetingCache({
      database: test.database,
      monitoring: new FakeMonitoring(),
      timeoutMillis: 20,
    });
    test.faults.hang(true);

    const answers = await Promise.all([
      cache.readMeeting(OWNER, MEETING.id),
      cache.readPage(OWNER, PAGE_KEY),
      cache.saveMeeting(OWNER, MEETING, at(1)),
      cache.removeMeeting(OWNER, MEETING.id),
      cache.purge(),
    ]);

    expect(answers.map((answer) => !answer.ok && answer.error.cause)).toEqual([
      'timeout',
      'timeout',
      'timeout',
      'timeout',
      'timeout',
    ]);
  });

  it('puts no statement, value or path in the cause of a failure', async () => {
    const test = await openTestDatabase(directory);
    const cache = new SqliteMeetingCache({
      database: test.database,
      monitoring: new FakeMonitoring(),
    });
    await test.database.run(`DROP TABLE ${TABLE.MeetingDetails}`);

    const failed = await cache.readMeeting(OWNER, MEETING.id);

    expect(failed).toStrictEqual(err(storageReadFailed('sqlite error 1')));
    expect(JSON.stringify(failed)).not.toContain(TABLE.MeetingDetails);
  });
});

describe('the tables of SqliteMeetingCache', () => {
  it('hold one row per owner and key, with the key in separate columns', async () => {
    const { test, cache } = await openCache();
    await cache.saveMeeting(OWNER, MEETING, at(1));
    await cache.saveMeeting(OWNER, MEETING, at(2));
    await cache.saveMeeting(aUserId('owner-2'), MEETING, at(3));
    await cache.savePage(OWNER, PAGE_KEY, createPage([]), at(4));
    await cache.savePage(
      OWNER,
      { ...PAGE_KEY, cursor: unwrap(parsePageCursor('c')) },
      createPage([]),
      at(5),
    );

    const details = await test.database.all(
      `SELECT ${COLUMN.Owner}, ${COLUMN.MeetingId} FROM ${TABLE.MeetingDetails} ORDER BY ${COLUMN.Owner}`,
    );
    const pages = await test.database.all(
      `SELECT ${COLUMN.CursorKey} FROM ${TABLE.MeetingPages} ORDER BY ${COLUMN.CursorKey}`,
    );

    expect(details.map((row) => ({ ...row }))).toEqual([
      { owner: 'owner-1', meeting_id: 'meeting-1' },
      { owner: 'owner-2', meeting_id: 'meeting-1' },
    ]);
    expect(pages.map((row) => row.cursor_key)).toEqual(['"c"', 'null']);
  });
});
