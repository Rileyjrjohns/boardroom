import type { Result } from '@domain/shared/Result';

import type { SqlConnection } from './SqlDatabase';

/** Why a database could not be opened. */
export const OPEN_FAILURE = {
  /** The file exists and the key does not open it: it was written with another key, or it is not a database. */
  KeyRejected: 'keyRejected',
  /** The engine cannot encrypt: it is plain SQLite, and nothing is written. */
  EncryptionUnavailable: 'encryptionUnavailable',
  /** Anything else: the file cannot be read or created, the storage is full. */
  Failed: 'failed',
} as const;

export type OpenFailure = (typeof OPEN_FAILURE)[keyof typeof OPEN_FAILURE];

/**
 * The part of an engine that cannot be tested without a device: opening an encrypted database
 * file. `expo-sqlite` (SQLCipher) provides it on a device, and `node:sqlite` in the tests, where
 * the files are not encrypted. Everything that decides what to do with the key (create it, find
 * it lost, start over) is in `openProtectedDatabase`, which is tested.
 */
export interface DatabaseOpener {
  /**
   * Opens the database file of this name in the private storage of the app, creating it if it is
   * not there, and unlocks it with the key (64 hexadecimal digits: a 256-bit key). It never
   * rejects. An engine that cannot tell a wrong key from a file that is not a database says
   * `keyRejected` for both.
   */
  open(name: string, key: string): Promise<Result<SqlConnection, OpenFailure>>;

  /**
   * A database in memory, which never touches the disk and is not encrypted. It is where random
   * numbers come from (see `randomKey`). The caller closes it.
   */
  openScratch(): Promise<SqlConnection>;

  /** Deletes the file of a database, and anything that goes with it. Deleting a file that is not there succeeds. */
  delete(name: string): Promise<void>;
}

/**
 * What every connection is set up with once it is open. `secure_delete` overwrites deleted content
 * with zeros, so that a vote that was removed or a cache that was purged does not stay readable in
 * the free pages of the file. The journal is left at its default (a rollback journal that is
 * deleted after each transaction): there is one connection, so nothing is gained from a write-ahead
 * log, and a log file that outlived the database it belonged to, when the database is deleted and
 * created again, would be applied to the new one.
 */
export const CONNECTION_PRAGMAS = 'PRAGMA secure_delete = ON';
