import type { DatabaseOpener, EngineConnection } from '../persistence/DatabaseOpener';
import type { SqlParams, SqlRow, SqlRunResult } from '../persistence/SqlDatabase';

// Test support, not production code: the one thing of an encrypted database that Node's SQLite
// cannot do, answering "file is not a database" to a key that is not the one the file was created
// with. It wraps another opener and remembers the key each file was first unlocked with, so that
// the logic that decides what to do about a lost, rejected or unreadable key (`unlockDatabase` and
// `openProtectedDatabase`) is run against files that behave like encrypted ones. It simulates the
// answers of SQLCipher, not its cryptography: the data of a file stays readable by whoever opens
// it with the key it was created with, which is what lets a test see that a file was kept.

const SET_KEY = /^PRAGMA key = "x'([0-9a-f]+)'"$/;
const CIPHER_VERSION = 'PRAGMA cipher_version';
const READ_SCHEMA = 'SELECT count(*) FROM sqlite_master';
const VERSION = '4.0.0-simulated';
const NOT_A_DATABASE = 'file is not a database';
const CANNOT_OPEN = 'unable to open database file';

export class SimulatedCipherOpener implements DatabaseOpener {
  /** The key each file was first unlocked with. */
  private readonly keys = new Map<string, string>();
  private readonly unreadable = new Set<string>();
  private cipher = true;
  private opensToFail = 0;

  /** Every key the files were unlocked with, in order, to see what was used. */
  readonly keysUsed: string[] = [];
  /** Every file name that was removed, in order. */
  readonly removed: string[] = [];

  constructor(private readonly inner: DatabaseOpener) {}

  /** Whether the engine can encrypt. Without it, a connection answers no cipher version. */
  setCipher(available: boolean): void {
    this.cipher = available;
  }

  /** The next `count` opens of a file reject, like a disk that is full. */
  failNextOpens(count = 1): void {
    this.opensToFail = count;
  }

  /** Whether a file of this name has been unlocked at least once and not removed. */
  has(name: string): boolean {
    return this.keys.has(name);
  }

  /** The file is no longer a database: it is not one for any key. */
  corrupt(name: string): void {
    this.unreadable.add(name);
  }

  async open(name: string): Promise<EngineConnection> {
    if (this.opensToFail > 0) {
      this.opensToFail -= 1;
      throw new Error(CANNOT_OPEN);
    }
    return new SimulatedConnection(await this.inner.open(name), name, this);
  }

  async remove(name: string): Promise<void> {
    this.removed.push(name);
    this.keys.delete(name);
    this.unreadable.delete(name);
    await this.inner.remove(name);
  }

  /** @internal What a connection asks of the file it is on. */
  isCipher(): boolean {
    return this.cipher;
  }

  /** @internal Records the key of a connection, and fails as SQLCipher does when it is not the file's. */
  checkKey(name: string, offered: string | undefined): void {
    if (this.unreadable.has(name)) throw new Error(NOT_A_DATABASE);
    const known = this.keys.get(name);
    if (known !== undefined && known !== offered) throw new Error(NOT_A_DATABASE);
    if (offered !== undefined) this.keys.set(name, offered);
  }

  /** @internal */
  keyUsed(key: string): void {
    this.keysUsed.push(key);
  }
}

class SimulatedConnection implements EngineConnection {
  private offered: string | undefined;

  constructor(
    private readonly inner: EngineConnection,
    private readonly name: string,
    private readonly device: SimulatedCipherOpener,
  ) {}

  async exec(sql: string): Promise<void> {
    const key = SET_KEY.exec(sql)?.[1];
    if (key !== undefined) {
      this.offered = key;
      this.device.keyUsed(key);
      return;
    }
    await this.inner.exec(sql);
  }

  run(sql: string, params: SqlParams): Promise<SqlRunResult> {
    return this.inner.run(sql, params);
  }

  async all(sql: string, params: SqlParams): Promise<readonly SqlRow[]> {
    if (sql === CIPHER_VERSION) return this.device.isCipher() ? [{ cipher_version: VERSION }] : [];
    if (sql === READ_SCHEMA) this.device.checkKey(this.name, this.offered);
    return this.inner.all(sql, params);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}
