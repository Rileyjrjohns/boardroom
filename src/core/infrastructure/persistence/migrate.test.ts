import { databaseDirectory, openTestDatabase } from '@testing/infrastructure/testDatabase';

import { MIGRATION_FAILURE, runMigrations } from './migrate';
import type { Migration } from './migrate';
import type { SqlDatabase } from './SqlDatabase';

// The machinery that brings a database to the last of a list of migrations, tried on a history of
// its own: it knows no table of the app. The history of the app is tested where it is kept
// (`src/composition/persistence/migrations.test.ts`).

const directory = databaseDirectory();

const NOTES = 'notes';
const NOTES_BY_BODY = 'notes_by_body';

/** A history of two versions, as small as a history can be. */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE ${NOTES} (id TEXT NOT NULL PRIMARY KEY, body TEXT NOT NULL) WITHOUT ROWID`,
    ],
  },
  { version: 2, statements: [`CREATE INDEX ${NOTES_BY_BODY} ON ${NOTES} (body)`] },
];

const LATEST = MIGRATIONS.at(-1)?.version ?? 0;

async function versionOf(database: SqlDatabase): Promise<unknown> {
  return (await database.all('PRAGMA user_version'))[0]?.user_version;
}

async function objectsOf(database: SqlDatabase): Promise<string[]> {
  const rows = await database.all("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  return rows.map((row) => String(row.name)).sort();
}

/** A row that is valid at version 1, written the way that version wrote it. */
async function fillAtVersionOne(database: SqlDatabase): Promise<void> {
  await database.run(`INSERT INTO ${NOTES} (id, body) VALUES (?, ?)`, ['note', 'text']);
}

describe('the migrations', () => {
  it('create what the list says, in a new database', async () => {
    const { database } = await openTestDatabase(directory, []);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: MIGRATIONS.length } });
    expect(await versionOf(database)).toBe(LATEST);
    expect(await objectsOf(database)).toEqual([NOTES, NOTES_BY_BODY].sort());
  });

  it.each(MIGRATIONS.map(({ version }) => version))(
    'bring a database that is at version %s to the latest, keeping its rows',
    async (past) => {
      const { database } = await openTestDatabase(directory, MIGRATIONS.slice(0, past));
      await fillAtVersionOne(database);
      expect(await versionOf(database)).toBe(past);

      const outcome = await runMigrations(database, MIGRATIONS);

      expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: LATEST - past } });
      expect(await versionOf(database)).toBe(LATEST);
      expect(await database.all(`SELECT id FROM ${NOTES}`)).toEqual([{ id: 'note' }]);
      expect(await objectsOf(database)).toContain(NOTES_BY_BODY);
    },
  );

  it('do nothing to a database that is up to date', async () => {
    const { database } = await openTestDatabase(directory, MIGRATIONS);
    await fillAtVersionOne(database);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: 0 } });
    expect(await database.all(`SELECT * FROM ${NOTES}`)).toHaveLength(1);
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
      const { database } = await openTestDatabase(directory, MIGRATIONS);
      await fillAtVersionOne(database);
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
      expect(await database.all(`SELECT * FROM ${NOTES}`)).toHaveLength(1);
    });

    it('keeps the migrations that succeeded before it', async () => {
      const { database } = await openTestDatabase(directory, []);

      const outcome = await runMigrations(database, [...MIGRATIONS, THIRD]);

      expect(!outcome.ok && outcome.error.kind).toBe(MIGRATION_FAILURE.MigrationFailed);
      expect(await versionOf(database)).toBe(LATEST);
    });

    it('does not put the text of the statement or of the engine in its cause', async () => {
      const { database } = await openTestDatabase(directory, MIGRATIONS);

      const outcome = await runMigrations(database, [...MIGRATIONS, THIRD]);

      expect(JSON.stringify(outcome)).not.toContain('a_table_that_is_not_there');
    });

    it('can be run again once it is fixed', async () => {
      const { database } = await openTestDatabase(directory, MIGRATIONS);
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
    const { database } = await openTestDatabase(directory, MIGRATIONS);
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
