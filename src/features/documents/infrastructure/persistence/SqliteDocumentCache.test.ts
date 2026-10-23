import { COLUMN, TABLE } from '@composition/persistence/schema';
import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import { temporaryDirectory } from '@core/infrastructure/testing/NodeSqlite';
import { describeDocumentCacheContract } from '@features/documents/application/testing/contracts/documentCacheContract';
import type { DocumentCacheHarness } from '@features/documents/application/testing/contracts/documentCacheContract';
import {
  aConfidentialDocument,
  aDocument,
  aDocumentLocation,
  aUserId,
  at,
} from '@testing/domain/builders';
import { databaseDirectory, openTestDatabase } from '@testing/infrastructure/testDatabase';
import type { TestDatabase } from '@testing/infrastructure/testDatabase';

import { aDocumentDevice } from '../testing/documentDevice';
import type { DocumentDevice } from '../testing/documentDevice';

import { SqliteDocumentCache } from './SqliteDocumentCache';
import { storedDocumentOf } from './storedDocument';

const databases = databaseDirectory();
const filesParent = temporaryDirectory();

/** The cache over a real SQLite database in a file and real files, and what the suite needs to wreck them. */
function harnessOf(
  test: TestDatabase,
  device: DocumentDevice,
  monitoring = new FakeMonitoring(),
): DocumentCacheHarness {
  const cache = new SqliteDocumentCache({
    database: test.database,
    files: device.store,
    monitoring,
  });
  return {
    cache,
    // A full disk: nothing can be added, but space can still be freed.
    breakWrites: () => test.faults.failWhileAddingData(true),
    repairWrites: () => test.faults.failWhileAddingData(false),
    failNextStatement: () => test.faults.failNext(),
    files: device.files,
    reopen: async () => {
      const reopened = await test.reopen();
      return harnessOf(reopened, device, monitoring).cache;
    },
  };
}

describeDocumentCacheContract(
  'SqliteDocumentCache',
  async () => harnessOf(await openTestDatabase(databases), aDocumentDevice(filesParent)),
  { failsStatements: true, survivesReopen: true, keepsFiles: true },
);

// What the contract cannot say: the format of the rows, what a row that does not read back becomes,
// the files that no row points at, and the time limits.

const OWNER = aUserId('owner-1');
const OTHER_OWNER = aUserId('owner-2');
const DOCUMENT = aDocument();
const LOCATION = aDocumentLocation('file:///documents/document-1.pdf');
const VIEWABLE = { document: DOCUMENT, location: LOCATION };

/** A row exactly as the first version of the cache wrote it. */
const ROW_WRITTEN_BEFORE =
  '{"id":"document-1","title":"Financial statements","confidentiality":"internal","pageCount":3}';

async function openCache(timeoutMillis?: number) {
  const test = await openTestDatabase(databases);
  const device = aDocumentDevice(filesParent, {
    ...(timeoutMillis === undefined ? {} : { timeoutMillis }),
  });
  const monitoring = new FakeMonitoring();
  const cache = new SqliteDocumentCache({
    database: test.database,
    files: device.store,
    monitoring,
    ...(timeoutMillis === undefined ? {} : { timeoutMillis }),
  });
  return { test, device, monitoring, cache };
}

const rowsLeft = async (test: TestDatabase): Promise<number> =>
  Number(
    (await test.database.all(`SELECT count(*) AS total FROM ${TABLE.DocumentEntries}`))[0]?.total,
  );

const filesLeft = async (device: DocumentDevice): Promise<string[]> => {
  const listed = await device.store.list();
  return listed.ok ? [...listed.value].sort() : [];
};

describe('SqliteDocumentCache, on rows written by an earlier version', () => {
  it('reads a document as it was written then', async () => {
    const { test, device, monitoring, cache } = await openCache();
    await device.files.put(LOCATION);
    await test.database.run(
      `INSERT INTO ${TABLE.DocumentEntries} (owner, document_id, cached_at, location, payload) VALUES (?, ?, ?, ?, ?)`,
      [OWNER, DOCUMENT.id, at(10), LOCATION, ROW_WRITTEN_BEFORE],
    );

    expect(await cache.read(OWNER, DOCUMENT.id)).toStrictEqual(
      ok({ value: VIEWABLE, cachedAt: at(10) }),
    );
    expect(monitoring.errors).toEqual([]);
  });

  it('writes what it reads: a row written now is the row written then', async () => {
    const { test, device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));

    const rows = await test.database.all(
      `SELECT ${COLUMN.Payload}, ${COLUMN.Location}, ${COLUMN.CachedAt} FROM ${TABLE.DocumentEntries}`,
    );

    expect(rows).toEqual([{ payload: ROW_WRITTEN_BEFORE, location: LOCATION, cached_at: at(10) }]);
    expect(JSON.stringify(storedDocumentOf(DOCUMENT))).toBe(ROW_WRITTEN_BEFORE);
  });

  it('keeps the location apart from the metadata, in a column of its own', async () => {
    const { test, device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));

    const [row] = await test.database.all(`SELECT payload FROM ${TABLE.DocumentEntries}`);

    expect(String(row?.payload)).not.toContain('file:');
  });
});

describe('SqliteDocumentCache, on rows that no longer read back', () => {
  /** Overwrites a column of the stored row behind the back of the cache. */
  async function corrupt(column: string, value: string | number) {
    const context = await openCache();
    await context.device.files.put(LOCATION);
    await context.cache.save(OWNER, VIEWABLE, at(10));
    await context.test.database.run(`UPDATE ${TABLE.DocumentEntries} SET ${column} = ?`, [value]);
    return context;
  }

  it.each([
    ['text that is not JSON', COLUMN.Payload, 'not json at all'],
    [
      'JSON that is not the shape of a document',
      COLUMN.Payload,
      JSON.stringify({ id: 'document-1' }),
    ],
    [
      'a document whose level nobody knows',
      COLUMN.Payload,
      JSON.stringify({ ...storedDocumentOf(DOCUMENT), confidentiality: 'secret' }),
    ],
    [
      'a document with a blank title',
      COLUMN.Payload,
      JSON.stringify({ ...storedDocumentOf(DOCUMENT), title: '  ' }),
    ],
    ['an instant that is not one', COLUMN.CachedAt, -1],
    ['a location that is blank', COLUMN.Location, '   '],
    ['a location that is no file of the store', COLUMN.Location, 'memory://documents/1/user/doc'],
  ])('reads %s as a miss, reports it, and deletes the row', async (_name, column, value) => {
    const { test, monitoring, cache } = await corrupt(column, value);

    expect(await cache.read(OWNER, DOCUMENT.id)).toStrictEqual(ok(undefined));

    expect(monitoring.capturedEvents()).toEqual([MONITORING_EVENT.StoredRowDiscarded]);
    expect(await rowsLeft(test)).toBe(0);
  });

  it('deletes the file of a row it cannot read, and not the file another owner needs', async () => {
    const { test, device, cache } = await corrupt(COLUMN.Payload, 'not json at all');
    await device.files.put(aDocumentLocation('file:///documents/kept.pdf'));
    await test.database.run(
      `INSERT INTO ${TABLE.DocumentEntries} (owner, document_id, cached_at, location, payload) VALUES (?, ?, ?, ?, ?)`,
      [OTHER_OWNER, DOCUMENT.id, at(11), LOCATION, ROW_WRITTEN_BEFORE],
    );

    await cache.read(OWNER, DOCUMENT.id);

    // The other owner still points at it.
    expect(await filesLeft(device)).toEqual(['document-1.pdf', 'kept.pdf']);
    expect(await cache.read(OTHER_OWNER, DOCUMENT.id)).toStrictEqual(
      ok({ value: VIEWABLE, cachedAt: at(11) }),
    );
  });

  it('deletes the file of a row it cannot read when nobody else needs it', async () => {
    const { device, cache } = await corrupt(COLUMN.Payload, 'not json at all');

    await cache.read(OWNER, DOCUMENT.id);

    expect(await filesLeft(device)).toEqual([]);
  });

  it('puts no path, location, title nor value in what it reports', async () => {
    const { monitoring, cache } = await corrupt(
      COLUMN.Payload,
      JSON.stringify({ ...storedDocumentOf(DOCUMENT), title: '   ', secret: 'Remuneration' }),
    );

    await cache.read(OWNER, DOCUMENT.id);

    expect(JSON.stringify(monitoring.errors)).not.toMatch(
      /documents|Financial|Remuneration|owner-1/,
    );
  });

  it('drops the row of a document whose content is gone, and only while it still points there', async () => {
    const { test, device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));
    await device.files.lose(LOCATION);

    expect(await cache.read(OWNER, DOCUMENT.id)).toStrictEqual(ok(undefined));

    expect(await rowsLeft(test)).toBe(0);
  });

  it('fails the read, and keeps the row, when the file system cannot say whether the content is there', async () => {
    const { test, device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));
    device.volume.fail('size', true);

    const failed = await cache.read(OWNER, DOCUMENT.id);

    expect(!failed.ok && failed.error).toEqual({
      code: STORAGE_ERROR_CODE.ReadFailed,
      cause: 'EIO',
    });
    expect(await rowsLeft(test)).toBe(1);
  });
});

describe('SqliteDocumentCache, the content', () => {
  it('shares a file between owners by count: it goes with the last entry that points at it', async () => {
    const { device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));
    await cache.save(OTHER_OWNER, VIEWABLE, at(11));
    await cache.save(OWNER, { ...VIEWABLE, document: aConfidentialDocument() }, at(12));

    await cache.remove(OWNER, DOCUMENT.id);
    expect(await filesLeft(device)).toEqual(['document-1.pdf']);

    await cache.remove(OTHER_OWNER, DOCUMENT.id);
    expect(await filesLeft(device)).toEqual([]);
  });

  it('drops the entry of a save that moves it, even when the file it leaves cannot be deleted', async () => {
    const { test, device, cache } = await openCache();
    const moved = { ...VIEWABLE, location: aDocumentLocation('file:///documents/moved.pdf') };
    await device.files.put(LOCATION);
    await device.files.put(moved.location);
    await cache.save(OWNER, VIEWABLE, at(10));
    device.files.breakDeletion();

    const failed = await cache.save(OWNER, moved, at(11));

    expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
    // The older entry is not served as if it were current, and the file it left is for the sweep.
    expect(await rowsLeft(test)).toBe(0);
    device.files.repairDeletion();
    expect((await cache.sweepOrphans()).ok).toBe(true);
    expect(await filesLeft(device)).toEqual([]);
  });

  it('purges the files no entry points at as well', async () => {
    const { device, cache } = await openCache();
    await device.files.put(LOCATION);
    await device.files.put(aDocumentLocation('file:///documents/orphan.pdf'));
    await cache.save(OWNER, VIEWABLE, at(10));

    expect(await cache.purge()).toStrictEqual(ok(undefined));

    expect(await filesLeft(device)).toEqual([]);
  });

  it('removes the entries whose file was deleted on a purge, and keeps the ones whose file was not', async () => {
    const { test, device, cache } = await openCache();
    const other = {
      document: aConfidentialDocument(),
      location: aDocumentLocation('file:///documents/other.pdf'),
    };
    await device.files.put(LOCATION);
    await device.files.put(other.location);
    await cache.save(OWNER, VIEWABLE, at(10));
    await cache.save(OWNER, other, at(11));
    // Only the file of the second document cannot be deleted.
    const real = device.volume.remove.bind(device.volume);
    device.volume.remove = (name: string) =>
      name === 'other.pdf'
        ? Promise.reject(Object.assign(new Error('locked'), { code: 'EBUSY' }))
        : real(name);

    const failed = await cache.purge();

    expect(failed).toStrictEqual({
      ok: false,
      error: { code: STORAGE_ERROR_CODE.WriteFailed, cause: 'EBUSY' },
    });
    const rows = await test.database.all(
      `SELECT ${COLUMN.DocumentId} FROM ${TABLE.DocumentEntries}`,
    );
    expect(rows.map((row) => row.document_id)).toEqual([other.document.id]);
    expect(await filesLeft(device)).toEqual(['other.pdf']);
  });
});

describe('SqliteDocumentCache, the files that no entry points at', () => {
  it('deletes them when it starts, and keeps the ones an entry points at', async () => {
    const { device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));
    await device.files.put(aDocumentLocation('file:///documents/orphan.pdf'));
    await device.volume.write('document-9.pdf.abc1.part', Uint8Array.from([1]));

    expect(await cache.sweepOrphans()).toStrictEqual(ok(undefined));

    expect(await filesLeft(device)).toEqual(['document-1.pdf']);
    expect(await cache.read(OWNER, DOCUMENT.id)).toStrictEqual(
      ok({ value: VIEWABLE, cachedAt: at(10) }),
    );
  });

  it('keeps a file that a row of another owner points at', async () => {
    const { device, cache } = await openCache();
    await device.files.put(LOCATION);
    await cache.save(OTHER_OWNER, VIEWABLE, at(10));

    await cache.sweepOrphans();

    expect(await filesLeft(device)).toEqual(['document-1.pdf']);
  });

  it('does nothing when the directory does not exist yet', async () => {
    const { cache } = await openCache();

    expect(await cache.sweepOrphans()).toStrictEqual(ok(undefined));
  });

  it('goes on with the other files when one cannot be deleted, and fails without reporting it', async () => {
    const { device, monitoring, cache } = await openCache();
    await device.files.put(aDocumentLocation('file:///documents/a.pdf'));
    await device.files.put(aDocumentLocation('file:///documents/b.pdf'));
    const real = device.volume.remove.bind(device.volume);
    device.volume.remove = (name: string) =>
      name === 'a.pdf'
        ? Promise.reject(Object.assign(new Error('locked'), { code: 'EBUSY' }))
        : real(name);

    const failed = await cache.sweepOrphans();

    expect(!failed.ok && failed.error.code).toBe(STORAGE_ERROR_CODE.WriteFailed);
    // The composition root reports the failure of the sweep, once: the cache does not.
    expect(monitoring.capturedEvents()).toEqual([]);
    expect(await filesLeft(device)).toEqual(['a.pdf']);
  });

  it('fails when the files cannot be listed', async () => {
    const { device, cache } = await openCache();
    device.volume.fail('list', true);

    const failed = await cache.sweepOrphans();

    expect(!failed.ok && failed.error).toEqual({
      code: STORAGE_ERROR_CODE.WriteFailed,
      cause: 'EIO',
    });
  });
});

describe('SqliteDocumentCache, in bounded time', () => {
  const SHORT = 30;

  it('fails a read when the file system never answers', async () => {
    const { device, cache } = await openCache(SHORT);
    await device.files.put(LOCATION);
    await cache.save(OWNER, VIEWABLE, at(10));
    device.volume.hang('size', true);

    const failed = await cache.read(OWNER, DOCUMENT.id);

    expect(!failed.ok && failed.error).toEqual({
      code: STORAGE_ERROR_CODE.ReadFailed,
      cause: 'timeout',
    });
  });

  it('fails a removal when the database never answers', async () => {
    const { test, cache } = await openCache(SHORT);
    test.faults.hang(true);

    const failed = await cache.remove(OWNER, DOCUMENT.id);

    expect(!failed.ok && failed.error).toEqual({
      code: STORAGE_ERROR_CODE.WriteFailed,
      cause: 'timeout',
    });
  });
});
