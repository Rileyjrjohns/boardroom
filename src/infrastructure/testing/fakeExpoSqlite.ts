import { IN_MEMORY_DATABASE, NodeSqliteConnection } from './NodeSqlite';

// Test support, not production code: a stand-in for the native side of `expo-sqlite`, for the test
// of the thin wrapper over it (`ExpoSqliteOpener`). It runs the statements on `node:sqlite` and
// behaves like SQLCipher in the two ways the wrapper depends on: it answers a version to
// `PRAGMA cipher_version`, and it says "file is not a database" to a file opened with another key.

export const fakeExpoSqlite = {
  /** Whether the engine is SQLCipher. Plain SQLite does not know `PRAGMA cipher_version`. */
  sqlcipher: true,
  /** The key each file was first unlocked with. */
  keys: new Map<string, string>(),
  /** Every statement sent to every database, in order. */
  statements: [] as string[],
  /** The databases that were opened and not closed. */
  open: new Set<FakeDatabase>(),
  /** Makes the next `openDatabaseAsync` reject with this message. */
  failOpenWith: undefined as string | undefined,
  /** Makes the next `closeAsync` reject. */
  failClose: false,
};

export function resetFakeExpoSqlite(): void {
  fakeExpoSqlite.sqlcipher = true;
  fakeExpoSqlite.keys.clear();
  fakeExpoSqlite.statements.length = 0;
  fakeExpoSqlite.open.clear();
  fakeExpoSqlite.failOpenWith = undefined;
  fakeExpoSqlite.failClose = false;
}

const SET_KEY = /^PRAGMA key = "x'([0-9a-f]+)'"$/;
const CIPHER_VERSION = 'PRAGMA cipher_version';
const FIRST_READ = 'SELECT count(*) FROM sqlite_master';
const VERSION = '4.0.0-fake';

class FakeDatabase {
  private offered: string | undefined;
  private readonly connection: NodeSqliteConnection;

  constructor(private readonly name: string) {
    this.connection = new NodeSqliteConnection(IN_MEMORY_DATABASE);
  }

  async execAsync(sql: string): Promise<void> {
    fakeExpoSqlite.statements.push(sql);
    const key = SET_KEY.exec(sql)?.[1];
    if (key !== undefined) {
      this.offered = key;
      return;
    }
    await this.connection.run(sql, []);
  }

  async runAsync(
    sql: string,
    params: unknown[],
  ): Promise<{ changes: number; lastInsertRowId: number }> {
    fakeExpoSqlite.statements.push(sql);
    const { changes } = await this.connection.run(sql, params as never);
    return { changes, lastInsertRowId: 0 };
  }

  async getAllAsync<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    fakeExpoSqlite.statements.push(sql);
    if (sql === CIPHER_VERSION) {
      return (fakeExpoSqlite.sqlcipher ? [{ cipher_version: VERSION }] : []) as T[];
    }
    if (sql === FIRST_READ) this.checkKey();
    return (await this.connection.all(sql, params as never)) as T[];
  }

  closeAsync(): Promise<void> {
    if (fakeExpoSqlite.failClose) return Promise.reject(new Error('could not close'));
    fakeExpoSqlite.open.delete(this);
    return this.connection.close();
  }

  private checkKey(): void {
    const known = fakeExpoSqlite.keys.get(this.name);
    if (known !== undefined && known !== this.offered) throw new Error('file is not a database');
    if (this.offered !== undefined) fakeExpoSqlite.keys.set(this.name, this.offered);
  }
}

export function openDatabaseAsync(name: string): Promise<FakeDatabase> {
  if (fakeExpoSqlite.failOpenWith !== undefined) {
    const message = fakeExpoSqlite.failOpenWith;
    fakeExpoSqlite.failOpenWith = undefined;
    return Promise.reject(new Error(message));
  }
  const database = new FakeDatabase(name);
  fakeExpoSqlite.open.add(database);
  return Promise.resolve(database);
}

export function deleteDatabaseAsync(name: string): Promise<void> {
  fakeExpoSqlite.keys.delete(name);
  return Promise.resolve();
}
