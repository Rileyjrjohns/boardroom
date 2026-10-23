import { MIGRATIONS } from '@composition/persistence/migrations';
import type { Migration } from '@composition/persistence/migrations';
import { INDEX, TABLE } from '@composition/persistence/schema';
import { databaseDirectory, openTestDatabase } from '@testing/infrastructure/testDatabase';

import { MIGRATION_FAILURE, runMigrations } from './migrate';
import type { SqlDatabase } from './SqlDatabase';

const directory = databaseDirectory();

const LATEST = MIGRATIONS.at(-1)?.version ?? 0;

async function versionOf(database: SqlDatabase): Promise<unknown> {
  return (await database.all('PRAGMA user_version'))[0]?.user_version;
}

async function objectsOf(database: SqlDatabase): Promise<string[]> {
  const rows = await database.all("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  return rows.map((row) => String(row.name)).sort();
}

/** Rows that are valid at the version, written the way that version wrote them. */
async function fillAtVersion(database: SqlDatabase): Promise<void> {
  await database.run(
    `INSERT INTO ${TABLE.MeetingDetails} (owner, meeting_id, cached_at, payload) VALUES (?, ?, ?, ?)`,
    ['owner', 'meeting', 1, '{}'],
  );
  await database.run(
    `INSERT INTO ${TABLE.OutboxVotes}
      (idempotency_key, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['key', 'voter', 'resolution', 'meeting', 'for', 1, 2, 3, 'pending'],
  );
}

describe('the migrations', () => {
  it('are numbered 1, 2, 3, ... with no gap', () => {
    expect(MIGRATIONS.map(({ version }) => version)).toEqual(
      MIGRATIONS.map((_migration, position) => position + 1),
    );
  });

  it('create the caches and the outbox, and the indexes, in a new database', async () => {
    const { database } = await openTestDatabase(directory, []);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: MIGRATIONS.length } });
    expect(await versionOf(database)).toBe(LATEST);
    expect(await objectsOf(database)).toEqual(
      [
        TABLE.MeetingPages,
        TABLE.MeetingDetails,
        TABLE.DocumentEntries,
        TABLE.OutboxVotes,
        INDEX.OutboxByResolution,
        INDEX.DocumentEntriesByLocation,
      ].sort(),
    );
  });

  it.each(MIGRATIONS.map(({ version }) => version))(
    'bring a database that is at version %s to the latest, with its content',
    async (past) => {
      const { database } = await openTestDatabase(directory, MIGRATIONS.slice(0, past));
      await fillAtVersion(database);
      expect(await versionOf(database)).toBe(past);

      const outcome = await runMigrations(database, MIGRATIONS);

      expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: LATEST - past } });
      expect(await versionOf(database)).toBe(LATEST);
      expect(
        (await database.all(`SELECT idempotency_key FROM ${TABLE.OutboxVotes}`)).map(
          (row) => row.idempotency_key,
        ),
      ).toEqual(['key']);
      expect(await database.all(`SELECT meeting_id FROM ${TABLE.MeetingDetails}`)).toHaveLength(1);
      expect(await objectsOf(database)).toContain(INDEX.OutboxByResolution);
      // Version 4 added the cache of documents, empty whatever the version it came from.
      expect(await database.all(`SELECT * FROM ${TABLE.DocumentEntries}`)).toEqual([]);
    },
  );

  it('make the cache of documents refuse two entries for the same owner and document', async () => {
    const { database } = await openTestDatabase(directory);
    const insert = `INSERT INTO ${TABLE.DocumentEntries}
      (owner, document_id, cached_at, location, payload) VALUES (?, ?, ?, ?, ?)`;
    await database.run(insert, ['owner', 'document', 1, 'file:///a.pdf', '{}']);

    await expect(
      database.run(insert, ['owner', 'document', 2, 'file:///b.pdf', '{}']),
    ).rejects.toThrow();
    // Another owner, or another document, is another entry.
    await database.run(insert, ['other', 'document', 1, 'file:///a.pdf', '{}']);
    await database.run(insert, ['owner', 'other', 1, 'file:///a.pdf', '{}']);
    expect(await database.all(`SELECT * FROM ${TABLE.DocumentEntries}`)).toHaveLength(3);
  });

  it('do nothing to a database that is up to date', async () => {
    const { database } = await openTestDatabase(directory);
    await fillAtVersion(database);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: 0 } });
    expect(await database.all(`SELECT * FROM ${TABLE.OutboxVotes}`)).toHaveLength(1);
  });

  it('run again from where they stopped when the app was stopped between two of them', async () => {
    const { database } = await openTestDatabase(directory, MIGRATIONS.slice(0, 1));

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: LATEST - 1 } });
  });

  describe('a migration that fails', () => {
    const THIRD: Migration = {
      version: LATEST + 1,
      statements: [
        'CREATE TABLE half_done (id INTEGER)',
        'INSERT INTO half_done VALUES (1)',
        'INSERT INTO a_table_that_is_not_there VALUES (1)',
      ],
    };

    it('leaves the database at the version before it, with nothing of what it had begun', async () => {
      const { database } = await openTestDatabase(directory);
      await fillAtVersion(database);
      const before = await objectsOf(database);

      const outcome = await runMigrations(database, [...MIGRATIONS, THIRD]);

      expect(outcome).toEqual({
        ok: false,
        error: expect.objectContaining({
          kind: MIGRATION_FAILURE.MigrationFailed,
          version: THIRD.version,
        }),
      });
      expect(await versionOf(database)).toBe(LATEST);
      expect(await objectsOf(database)).toEqual(before);
      expect(await database.all(`SELECT * FROM ${TABLE.OutboxVotes}`)).toHaveLength(1);
    });

    it('keeps the migrations that succeeded before it', async () => {
      const { database } = await openTestDatabase(directory, []);

      const outcome = await runMigrations(database, [...MIGRATIONS, THIRD]);

      expect(!outcome.ok && outcome.error.kind).toBe(MIGRATION_FAILURE.MigrationFailed);
      expect(await versionOf(database)).toBe(LATEST);
    });

    it('does not put the text of the statement or of the engine in its cause', async () => {
      const { database } = await openTestDatabase(directory);

      const outcome = await runMigrations(database, [...MIGRATIONS, THIRD]);

      expect(JSON.stringify(outcome)).not.toContain('a_table_that_is_not_there');
    });

    it('can be run again once it is fixed', async () => {
      const { database } = await openTestDatabase(directory);
      await runMigrations(database, [...MIGRATIONS, THIRD]);
      const fixed: Migration = {
        version: THIRD.version,
        statements: ['CREATE TABLE fixed (id INTEGER)'],
      };

      const outcome = await runMigrations(database, [...MIGRATIONS, fixed]);

      expect(outcome).toEqual({ ok: true, value: { version: THIRD.version, applied: 1 } });
      expect(await versionOf(database)).toBe(THIRD.version);
    });
  });

  it('refuse a database that a more recent version of the app wrote, and leave it alone', async () => {
    const { database } = await openTestDatabase(directory);
    await database.run(`PRAGMA user_version = ${LATEST + 5}`);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({
      ok: false,
      error: { kind: MIGRATION_FAILURE.DatabaseIsNewer, version: LATEST + 5 },
    });
    expect(await versionOf(database)).toBe(LATEST + 5);
  });

  it.each([
    [
      'a gap',
      [
        { version: 1, statements: [] },
        { version: 3, statements: [] },
      ],
    ],
    ['a list that does not start at 1', [{ version: 2, statements: [] }]],
    [
      'a repeated version',
      [
        { version: 1, statements: [] },
        { version: 1, statements: [] },
      ],
    ],
    ['a version that is not whole', [{ version: 1.5, statements: [] }]],
  ])('refuse %s in the list of migrations, before touching the database', async (_name, list) => {
    const { database } = await openTestDatabase(directory, []);

    const outcome = await runMigrations(database, list);

    expect(outcome).toEqual({ ok: false, error: { kind: MIGRATION_FAILURE.InvalidMigrations } });
    expect(await objectsOf(database)).toEqual([]);
  });

  it('report a version that cannot be read, without throwing', async () => {
    const { database, faults } = await openTestDatabase(directory, []);
    faults.failNext();

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({
      ok: false,
      error: expect.objectContaining({ kind: MIGRATION_FAILURE.VersionUnreadable }),
    });
  });

  it('do nothing for an empty list, and leave the database at version 0', async () => {
    const { database } = await openTestDatabase(directory, []);

    expect(await runMigrations(database, [])).toEqual({
      ok: true,
      value: { version: 0, applied: 0 },
    });
  });
});
