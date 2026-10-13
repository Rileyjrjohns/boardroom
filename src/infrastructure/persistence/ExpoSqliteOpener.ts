import * as SQLite from 'expo-sqlite';

import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { OPEN_FAILURE } from './DatabaseOpener';
import type { DatabaseOpener, OpenFailure } from './DatabaseOpener';
import type { SqlConnection, SqlParams, SqlRow, SqlRunResult } from './SqlDatabase';

// The device side of the database: `expo-sqlite`, built with SQLCipher (the `useSQLCipher` option
// of its config plugin, in app.config.ts). It is as thin as it can be, because it is the one part
// of the persistence that Jest cannot run for real: a test stands in for the native module and
// checks what is asked of it, and the encryption itself has been run on no device. Everything that
// decides anything is in `openProtectedDatabase`, `createSqlDatabase` and the adapters, which are
// tested against SQLite.

const KEY_FORMAT = /^[0-9a-f]{64}$/;

/** What SQLite says when a file is not a database, which is what a wrong key looks like. */
const NOT_A_DATABASE = /not a database/i;

/** Unlocks an encrypted database with a raw 256-bit key. `PRAGMA` takes no parameter. */
const unlockWith = (key: string): string => `PRAGMA key = "x'${key}'"`;

/** SQLCipher answers its version. Plain SQLite does not know the pragma, and answers nothing. */
const CIPHER_VERSION = 'PRAGMA cipher_version';

/** The first read of the file: with a wrong key, it is where SQLite finds out it is not a database. */
const READ_SCHEMA = 'SELECT count(*) FROM sqlite_master';

const IN_MEMORY = ':memory:';

class ExpoSqliteConnection implements SqlConnection {
  constructor(private readonly database: SQLite.SQLiteDatabase) {}

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

async function closeQuietly(database: SQLite.SQLiteDatabase | undefined): Promise<void> {
  try {
    await database?.closeAsync();
  } catch {
    // Nothing more can be done for a database that does not close.
  }
}

export class ExpoSqliteOpener implements DatabaseOpener {
  async open(name: string, key: string): Promise<Result<SqlConnection, OpenFailure>> {
    // The key goes into a statement, so it is checked to be nothing but the digits it should be.
    if (!KEY_FORMAT.test(key)) return err(OPEN_FAILURE.Failed);

    let database: SQLite.SQLiteDatabase | undefined;
    try {
      database = await SQLite.openDatabaseAsync(name);
      await database.execAsync(unlockWith(key));
      if ((await database.getAllAsync(CIPHER_VERSION)).length === 0) {
        await closeQuietly(database);
        return err(OPEN_FAILURE.EncryptionUnavailable);
      }
      await database.getAllAsync(READ_SCHEMA);
      return ok(new ExpoSqliteConnection(database));
    } catch (error) {
      await closeQuietly(database);
      const rejected = error instanceof Error && NOT_A_DATABASE.test(error.message);
      return err(rejected ? OPEN_FAILURE.KeyRejected : OPEN_FAILURE.Failed);
    }
  }

  async openScratch(): Promise<SqlConnection> {
    return new ExpoSqliteConnection(await SQLite.openDatabaseAsync(IN_MEMORY));
  }

  delete(name: string): Promise<void> {
    return SQLite.deleteDatabaseAsync(name);
  }
}
