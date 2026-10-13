import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { OPEN_FAILURE } from '../persistence/DatabaseOpener';
import type { DatabaseOpener, OpenFailure } from '../persistence/DatabaseOpener';
import type { SqlConnection } from '../persistence/SqlDatabase';

// Test support, not production code: the one thing of an encrypted database that Node's SQLite
// cannot do, answering "not a database" to a key that is not the one the file was created with.
// It wraps another opener and remembers the key of each file it created, so that the logic that
// decides what to do about a lost or rejected key (`openProtectedDatabase`) is run against a file
// that behaves like an encrypted one. It simulates the answer of SQLCipher, not its cryptography.

export class SimulatedCipherOpener implements DatabaseOpener {
  private readonly keys = new Map<string, string>();
  private cipher = true;
  private failure: OpenFailure | undefined;

  /** Every key the files were opened with, in order, to see what was used. */
  readonly keysUsed: string[] = [];

  constructor(private readonly inner: DatabaseOpener) {}

  /** Whether the engine can encrypt. Without it, every `open` says so and writes nothing. */
  setCipher(available: boolean): void {
    this.cipher = available;
  }

  /** The next `open` fails with this, once. */
  failNextOpenWith(failure: OpenFailure | undefined): void {
    this.failure = failure;
  }

  /** Whether a file of this name exists, as far as the opener knows. */
  has(name: string): boolean {
    return this.keys.has(name);
  }

  async open(name: string, key: string): Promise<Result<SqlConnection, OpenFailure>> {
    this.keysUsed.push(key);
    if (this.failure !== undefined) {
      const failure = this.failure;
      this.failure = undefined;
      return err(failure);
    }
    if (!this.cipher) return err(OPEN_FAILURE.EncryptionUnavailable);

    const known = this.keys.get(name);
    if (known !== undefined && known !== key) return err(OPEN_FAILURE.KeyRejected);

    const opened = await this.inner.open(name, key);
    if (opened.ok) this.keys.set(name, key);
    return opened.ok ? ok(opened.value) : opened;
  }

  openScratch(): Promise<SqlConnection> {
    return this.inner.openScratch();
  }

  async delete(name: string): Promise<void> {
    this.keys.delete(name);
    await this.inner.delete(name);
  }
}
