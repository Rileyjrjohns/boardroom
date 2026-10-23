import type { SqlConnection } from './SqlDatabase';

/**
 * A connection as the engine gives it, before it is unlocked: the statements of `SqlConnection`
 * and `exec`, for the ones that take no parameter and answer nothing, which is what `PRAGMA key`
 * is (a statement the engine takes no parameter for).
 */
export interface EngineConnection extends SqlConnection {
  exec(sql: string): Promise<void>;
}

/**
 * The part of an engine that cannot be tested without a device: its raw calls. `expo-sqlite`
 * (SQLCipher) provides it on a device, and `node:sqlite` in the tests, where the files are not
 * encrypted. It decides nothing: what to do with a key, a file that does not unlock or a file that
 * is in the way is in `unlockDatabase` and `openProtectedDatabase`, which are tested.
 *
 * Every method may reject: the callers bound them in time and turn a failure into a result.
 */
export interface DatabaseOpener {
  /**
   * Opens the database file of this name in the private storage of the app, creating it if it is
   * not there. The connection is not unlocked: no key has been given to it.
   */
  open(name: string): Promise<EngineConnection>;

  /**
   * Removes the file of a database. Removing a file that is not there succeeds. Only the main file
   * is promised to go: what the engine keeps beside it (a journal, which exists only if the app
   * stopped in the middle of a write) is not. Nothing relies on it: a database is never created
   * again under the name of one that was removed (see `databaseFileName`).
   */
  remove(name: string): Promise<void>;
}

/**
 * What every connection is set up with once it is open. `secure_delete` overwrites deleted content
 * with zeros, so that a vote that was removed or a cache that was purged does not stay readable in
 * the free pages of the file. The journal is left at its default (a rollback journal that is
 * deleted after each transaction): there is one connection, so nothing is gained from a write-ahead
 * log.
 */
export const CONNECTION_PRAGMAS = 'PRAGMA secure_delete = ON';
