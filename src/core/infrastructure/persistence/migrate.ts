import type { Migration } from '@composition/persistence/migrations';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import { describeFailure } from '../shared/attempt';

import type { SqlDatabase } from './SqlDatabase';

/** Where the version of the schema is kept: the `user_version` of the header of the database. */
const READ_VERSION = 'PRAGMA user_version';
const VERSION_COLUMN = 'user_version';

export const MIGRATION_FAILURE = {
  /** The list of migrations is not 1, 2, 3, ...: a bug of the app, found by its tests. */
  InvalidMigrations: 'invalidMigrations',
  /** The database was written by a more recent version of the app. It is left alone. */
  DatabaseIsNewer: 'databaseIsNewer',
  /** A migration failed. It was rolled back: the database is at the version before it. */
  MigrationFailed: 'migrationFailed',
  /** The version of the database could not be read. */
  VersionUnreadable: 'versionUnreadable',
} as const;

export interface MigrationFailure {
  readonly kind: (typeof MIGRATION_FAILURE)[keyof typeof MIGRATION_FAILURE];
  /** The version of the migration that failed, or the one the database is at. */
  readonly version?: number;
  /** A kind of failure, never a statement nor a message of the engine. */
  readonly cause?: string;
}

/** The version the database is at after the migrations, and how many ran. */
export interface MigrationOutcome {
  readonly version: number;
  readonly applied: number;
}

/**
 * Brings a database to the last of the migrations. The version it is at is stored in the database
 * itself; each migration runs in its own transaction with the update of that version, so a failure
 * leaves the database at the version before it, which the next start retries from. A database
 * that is already there does nothing, and one that is more recent than the migrations is refused.
 * It never throws.
 */
export async function runMigrations(
  database: SqlDatabase,
  migrations: readonly Migration[],
): Promise<Result<MigrationOutcome, MigrationFailure>> {
  if (!areInOrder(migrations)) return err({ kind: MIGRATION_FAILURE.InvalidMigrations });
  const latest = migrations.at(-1)?.version ?? 0;

  const found = await readVersion(database);
  if (!found.ok) return found;
  if (found.value > latest) {
    return err({ kind: MIGRATION_FAILURE.DatabaseIsNewer, version: found.value });
  }

  let applied = 0;
  for (const migration of migrations.filter(({ version }) => version > found.value)) {
    try {
      await database.transaction(async (tx) => {
        for (const statement of migration.statements) await tx.run(statement);
        // A version is a whole number of our own list, so it can be written into the statement:
        // `PRAGMA` takes no parameter.
        await tx.run(`PRAGMA user_version = ${migration.version}`);
      });
    } catch (error) {
      return err({
        kind: MIGRATION_FAILURE.MigrationFailed,
        version: migration.version,
        cause: describeFailure(error),
      });
    }
    applied += 1;
  }
  return ok({ version: latest, applied });
}

function areInOrder(migrations: readonly Migration[]): boolean {
  return migrations.every(
    ({ version }, position) => Number.isInteger(version) && version === position + 1,
  );
}

async function readVersion(database: SqlDatabase): Promise<Result<number, MigrationFailure>> {
  try {
    const [row] = await database.all(READ_VERSION);
    const version = row?.[VERSION_COLUMN];
    return typeof version === 'number'
      ? ok(version)
      : err({ kind: MIGRATION_FAILURE.VersionUnreadable });
  } catch (error) {
    return err({ kind: MIGRATION_FAILURE.VersionUnreadable, cause: describeFailure(error) });
  }
}
