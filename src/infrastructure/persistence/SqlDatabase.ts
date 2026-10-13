// The seam between the SQLite adapters (caches, outbox, migrations) and a SQLite engine. The
// adapters are written against `SqlDatabase`; two engines sit behind it: `expo-sqlite` on a device
// and `node:sqlite` in the tests, so the contract suites run real SQL in Jest.

/** What can be bound to a parameter, and what a column holds. Booleans are stored as 0 and 1. */
export type SqlValue = string | number | null;

export type SqlParams = readonly SqlValue[];

/** A row, by column name. */
export type SqlRow = Readonly<Record<string, SqlValue>>;

export interface SqlRunResult {
  /** How many rows the statement inserted, updated or deleted. */
  readonly changes: number;
}

/**
 * One connection to one database, which is what an engine provides. It may reject, and it may be
 * used from several places at once: `createSqlDatabase` makes it safe for both.
 */
export interface SqlConnection {
  run(sql: string, params: SqlParams): Promise<SqlRunResult>;
  all(sql: string, params: SqlParams): Promise<readonly SqlRow[]>;
  close(): Promise<void>;
}

/** Runs statements. */
export interface SqlExecutor {
  /** Runs a statement that returns no row (or whose rows are not wanted). */
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  /** Runs a statement and returns its rows. */
  all(sql: string, params?: SqlParams): Promise<readonly SqlRow[]>;
}

/**
 * What the adapters use. Statements run one at a time, in the order they were asked for, whatever
 * the number of callers, and a transaction holds the connection until it ends: the work of two
 * transactions never interleaves, and a lone statement never lands in the middle of one. The
 * methods reject when the engine does; the adapters turn that into the errors of their ports.
 */
export interface SqlDatabase extends SqlExecutor {
  /**
   * Runs `work` in a transaction: committed when it resolves, rolled back when it rejects (and the
   * rejection is passed on). `tx` is only valid while `work` runs.
   */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const BEGIN = 'BEGIN IMMEDIATE';
const COMMIT = 'COMMIT';
const ROLLBACK = 'ROLLBACK';

const TRANSACTION_ENDED = 'The transaction has ended.';

/**
 * The database of a connection. All the logic of serialisation and of transactions is here, so
 * that the two engines only have to provide the three calls of `SqlConnection`.
 */
export function createSqlDatabase(connection: SqlConnection): SqlDatabase {
  let tail: Promise<unknown> = Promise.resolve();

  /** Runs `job` once everything asked for before it has settled, whether it succeeded or not. */
  function inOrder<T>(job: () => Promise<T>): Promise<T> {
    const result = tail.then(job, job);
    tail = result.catch(() => undefined);
    return result;
  }

  return {
    run: (sql, params = []) => inOrder(() => connection.run(sql, params)),
    all: (sql, params = []) => inOrder(() => connection.all(sql, params)),
    close: () => inOrder(() => connection.close()),
    transaction: <T>(work: (tx: SqlExecutor) => Promise<T>) =>
      inOrder(async () => {
        await connection.run(BEGIN, []);
        let open = true;
        const tx: SqlExecutor = {
          run: (sql, params = []) =>
            open ? connection.run(sql, params) : Promise.reject(new Error(TRANSACTION_ENDED)),
          all: (sql, params = []) =>
            open ? connection.all(sql, params) : Promise.reject(new Error(TRANSACTION_ENDED)),
        };
        try {
          const value = await work(tx);
          await connection.run(COMMIT, []);
          return value;
        } catch (error) {
          // The original failure is the one to report: a rollback that fails too adds nothing.
          await connection.run(ROLLBACK, []).catch(() => undefined);
          throw error;
        } finally {
          open = false;
        }
      }),
  };
}
