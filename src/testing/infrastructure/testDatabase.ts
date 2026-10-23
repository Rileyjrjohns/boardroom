import { MIGRATIONS } from '@composition/persistence/migrations';
import { createSqlDatabase } from '@core/infrastructure/persistence/SqlDatabase';
import type { SqlDatabase } from '@core/infrastructure/persistence/SqlDatabase';
import { runMigrations } from '@core/infrastructure/persistence/migrate';
import type { Migration } from '@core/infrastructure/persistence/migrate';
import { FaultyConnection } from '@core/infrastructure/testing/FaultyConnection';
import {
  NodeSqliteConnection,
  nodeFileSystem,
  temporaryDirectory,
} from '@core/infrastructure/testing/NodeSqlite';

// Test support, not production code: a real SQLite database in a file of a temporary directory, at
// the latest version of the schema, whose connection can be made to fail, and which can be closed
// and opened again like the app being stopped and started.

export interface TestDatabase {
  readonly database: SqlDatabase;
  /** Makes the statements fail. */
  readonly faults: FaultyConnection;
  /** Closes this connection and opens the same file again, as a new start of the app would. */
  reopen(): Promise<TestDatabase>;
}

let counter = 0;

/**
 * The directory of the test file's databases. Call it at the top of the file: the directory is
 * removed when the file is done.
 */
export function databaseDirectory(): string {
  return temporaryDirectory();
}

/** A new database (an empty file of its own) migrated to the latest version, or to `migrations`. */
export async function openTestDatabase(
  directory: string,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<TestDatabase> {
  counter += 1;
  return openFile(directory, `test-${counter}.db`, migrations);
}

async function openFile(
  directory: string,
  name: string,
  migrations: readonly Migration[],
): Promise<TestDatabase> {
  const files = nodeFileSystem();
  const faults = new FaultyConnection(new NodeSqliteConnection(files.join(directory, name)));
  const database = createSqlDatabase(faults);
  const migrated = await runMigrations(database, migrations);
  if (!migrated.ok)
    throw new Error(`The test database could not be migrated: ${JSON.stringify(migrated.error)}`);
  return {
    database,
    faults,
    reopen: async () => {
      await database.close();
      return openFile(directory, name, migrations);
    },
  };
}
