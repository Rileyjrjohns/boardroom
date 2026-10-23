import type { SqlConnection, SqlParams, SqlRow, SqlRunResult } from '../persistence/SqlDatabase';

// Test support, not production code: a connection that fails when the test says so, to check that
// the adapters turn a storage failure into the error of their port and leave the data as it was.

/** A statement that adds data: what a full disk refuses, while it can still free space. */
const ADDS_DATA = /^\s*(INSERT|UPDATE|REPLACE)\b/i;

export class FaultyConnection implements SqlConnection {
  private failures = 0;
  private addingDataFails = false;
  private hanging = false;

  /** How many statements were sent, failed ones included. */
  statements = 0;

  constructor(private readonly inner: SqlConnection) {}

  /** The next `count` statements fail, whatever they are, then it works again. */
  failNext(count = 1): void {
    this.failures = count;
  }

  /** While set, the statements that add data (insert, update, replace) fail, and the others work: a full disk. */
  failWhileAddingData(failing: boolean): void {
    this.addingDataFails = failing;
  }

  /** While set, no statement ever answers. */
  hang(hanging: boolean): void {
    this.hanging = hanging;
  }

  run(sql: string, params: SqlParams): Promise<SqlRunResult> {
    return this.guard(sql, () => this.inner.run(sql, params));
  }

  all(sql: string, params: SqlParams): Promise<readonly SqlRow[]> {
    return this.guard(sql, () => this.inner.all(sql, params));
  }

  close(): Promise<void> {
    return this.inner.close();
  }

  private guard<T>(sql: string, send: () => Promise<T>): Promise<T> {
    this.statements += 1;
    if (this.hanging) return new Promise<T>(() => undefined);
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('the database failed'));
    }
    if (this.addingDataFails && ADDS_DATA.test(sql)) {
      return Promise.reject(new Error('the disk is full'));
    }
    return send();
  }
}
