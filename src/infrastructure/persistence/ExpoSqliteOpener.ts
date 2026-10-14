import * as SQLite from 'expo-sqlite';

import type { DatabaseOpener, EngineConnection } from './DatabaseOpener';
import type { SqlConnection, SqlParams, SqlRow, SqlRunResult } from './SqlDatabase';

// The device side of the database: `expo-sqlite`, built with SQLCipher (the `useSQLCipher` option
// of its config plugin, in app.config.ts). It is as thin as it can be: raw calls to the module and
// nothing that decides anything, because it is the one part of the persistence that Jest cannot
// run for real. A test stands in for the native module and checks what is asked of it, and the
// encryption itself has been run on no device. What to do with a key, with a file that does not
// unlock and with a file in the way is in `unlockDatabase` and `openProtectedDatabase`, which are
// tested against SQLite.

const IN_MEMORY = ':memory:';

/** What the module says when it is asked to delete a database that is not there. */
const NOT_FOUND = /not found/i;

class ExpoSqliteConnection implements EngineConnection {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

  exec(sql: string): Promise<void> {
    return this.database.execAsync(sql);
  }

  async run(sql: string, params: SqlParams): Promise<SqlRunResult> {
    const { changes } = await this.database.runAsync(sql, [...params]);
    return { changes };
  }

  all(sql: string, params: SqlParams): Promise<readonly SqlRow[]> {
    return this.database.getAllAsync<SqlRow>(sql, [...params]);
  }

  close(): Promise<void> {
    return this.database.closeAsync();
  }
}

export class ExpoSqliteOpener implements DatabaseOpener {
  async open(name: string): Promise<EngineConnection> {
    return new ExpoSqliteConnection(await SQLite.openDatabaseAsync(name));
  }

  async openScratch(): Promise<SqlConnection> {
    return new ExpoSqliteConnection(await SQLite.openDatabaseAsync(IN_MEMORY));
  }

  /**
   * The module rejects when there is no such database, and deletes the main file only. The first is
   * not a failure for the caller, who wants the file gone; the second is why a name is never reused.
   */
  async remove(name: string): Promise<void> {
    try {
      await SQLite.deleteDatabaseAsync(name);
    } catch (error) {
      if (!(error instanceof Error && NOT_FOUND.test(error.message))) throw error;
    }
  }
}
