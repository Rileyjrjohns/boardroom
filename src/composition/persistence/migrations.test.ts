import type { SqlDatabase } from '@core/infrastructure/persistence/SqlDatabase';
import { runMigrations } from '@core/infrastructure/persistence/migrate';
import { sha256Hex } from '@core/infrastructure/shared/sha256';
import { DOCUMENT_TABLE } from '@features/documents/infrastructure/persistence/schema';
import { MEETING_TABLE } from '@features/meetings/infrastructure/persistence/schema';
import { VOTE_TABLE } from '@features/votes/infrastructure/persistence/schema';
import { databaseDirectory, openTestDatabase } from '@testing/infrastructure/testDatabase';

import { MIGRATIONS } from './migrations';
import { SCHEMA_INDEXES, SCHEMA_TABLES } from './schema';

// The history of the database of the whole app, run by the machinery of the core
// (`src/core/infrastructure/persistence/migrate.test.ts` tests it on a history of its own).

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
    `INSERT INTO ${MEETING_TABLE.Details} (owner, meeting_id, cached_at, payload) VALUES (?, ?, ?, ?)`,
    ['owner', 'meeting', 1, '{}'],
  );
  await database.run(
    `INSERT INTO ${VOTE_TABLE.Outbox}
      (idempotency_key, voter_id, resolution_id, meeting_id, choice, cast_at, enqueued_at, attempts, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['key', 'voter', 'resolution', 'meeting', 'for', 1, 2, 3, 'pending'],
  );
}

/** What a migration is, as a text that changes when one character of its statements does. */
function fingerprintOf(statements: readonly string[]): string {
  return sha256Hex(JSON.stringify(statements));
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
    expect(await objectsOf(database)).toEqual([...SCHEMA_TABLES, ...SCHEMA_INDEXES].sort());
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
        (await database.all(`SELECT idempotency_key FROM ${VOTE_TABLE.Outbox}`)).map(
          (row) => row.idempotency_key,
        ),
      ).toEqual(['key']);
      expect(await database.all(`SELECT meeting_id FROM ${MEETING_TABLE.Details}`)).toHaveLength(1);
      expect(await objectsOf(database)).toEqual([...SCHEMA_TABLES, ...SCHEMA_INDEXES].sort());
      // Version 4 added the cache of documents, empty whatever the version it came from.
      expect(await database.all(`SELECT * FROM ${DOCUMENT_TABLE.Entries}`)).toEqual([]);
    },
  );

  it('make the cache of documents refuse two entries for the same owner and document', async () => {
    const { database } = await openTestDatabase(directory);
    const insert = `INSERT INTO ${DOCUMENT_TABLE.Entries}
      (owner, document_id, cached_at, location, payload) VALUES (?, ?, ?, ?, ?)`;
    await database.run(insert, ['owner', 'document', 1, 'file:///a.pdf', '{}']);

    await expect(
      database.run(insert, ['owner', 'document', 2, 'file:///b.pdf', '{}']),
    ).rejects.toThrow();
    // Another owner, or another document, is another entry.
    await database.run(insert, ['other', 'document', 1, 'file:///a.pdf', '{}']);
    await database.run(insert, ['owner', 'other', 1, 'file:///a.pdf', '{}']);
    expect(await database.all(`SELECT * FROM ${DOCUMENT_TABLE.Entries}`)).toHaveLength(3);
  });

  it('do nothing to a database that is up to date', async () => {
    const { database } = await openTestDatabase(directory);
    await fillAtVersion(database);

    const outcome = await runMigrations(database, MIGRATIONS);

    expect(outcome).toEqual({ ok: true, value: { version: LATEST, applied: 0 } });
    expect(await database.all(`SELECT * FROM ${VOTE_TABLE.Outbox}`)).toHaveLength(1);
  });

  // A migration that was released is never edited: a database written by an older version of the
  // app has gone through exactly these statements. The fingerprints are those of the statements as
  // they were released; a change to the schema is a new migration, with its own line here.
  it.each([
    [1, 'fe9e6d7bd5e140baa1f4b40ae2a2722a1bf54e5789565223742b38a4a6ff7fa5'],
    [2, '9426c95df6ba3749dc56d7ee380964d5e62961366320b8fa58fa5b329166aaf5'],
    [3, 'caedcb2683c41e5f4eb49f9a835698635a958bbc80559411f8579b408f42e030'],
    [4, '76357fb31067aa0e1df103a5d56844606e01ef872006f74327631a07702dee73'],
  ])('keep the statements of version %s as they were released', (version, fingerprint) => {
    const migration = MIGRATIONS.find((candidate) => candidate.version === version);

    expect(fingerprintOf(migration?.statements ?? [])).toBe(fingerprint);
  });
});
