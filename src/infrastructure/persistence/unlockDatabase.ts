import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { describeFailure } from '../shared/attempt';

import { KEY_FORMAT } from './databaseKey';
import type { EngineConnection } from './DatabaseOpener';

/** Why a database could not be unlocked. */
export const UNLOCK_FAILURE = {
  /** The file exists and the key does not open it: it was written with another key, or it is not a database. */
  KeyRejected: 'keyRejected',
  /** The engine cannot encrypt: it is plain SQLite, and nothing is written. */
  EncryptionUnavailable: 'encryptionUnavailable',
  /** Anything else: the file cannot be read, the storage is full. */
  Failed: 'failed',
} as const;

export type UnlockFailure = (typeof UNLOCK_FAILURE)[keyof typeof UNLOCK_FAILURE];

/** What SQLite says when a file is not a database, which is what a wrong key looks like. */
const NOT_A_DATABASE = /not a database/i;
/** The result code of the same failure, `SQLITE_NOTADB`, for an engine that gives it. */
const NOT_A_DATABASE_CODE = 'sqlite error 26';

/** `PRAGMA` takes no parameter, so the key is part of the statement, as a raw key. */
const unlockWith = (key: string): string => `PRAGMA key = "x'${key}'"`;

/** SQLCipher answers its version. Plain SQLite does not know the pragma, and answers nothing. */
const CIPHER_VERSION = 'PRAGMA cipher_version';

/** The first read of the file: with a wrong key, it is where SQLite finds out it is not a database. */
const READ_SCHEMA = 'SELECT count(*) FROM sqlite_master';

/**
 * Unlocks an open connection with the key, and reads the file once to find out the key opens it.
 * It is where the engine's answers are turned into a decision:
 *
 * - the key is checked to be nothing but the 64 digits it should be before it reaches a statement;
 * - an engine that does not answer a cipher version is plain SQLite, which would ignore the key and
 *   write in clear: `encryptionUnavailable`;
 * - "file is not a database" (the message, or its result code) is `keyRejected`: SQLite cannot tell
 *   a wrong key from a file that is not a database, and the callers do not need it to;
 * - anything else is `failed`.
 *
 * A connection that does not unlock is closed; one that does is the caller's to close. It never
 * rejects.
 */
export async function unlockDatabase(
  connection: EngineConnection,
  key: string,
): Promise<Result<void, UnlockFailure>> {
  if (!KEY_FORMAT.test(key)) {
    await closeQuietly(connection);
    return err(UNLOCK_FAILURE.Failed);
  }

  try {
    await connection.exec(unlockWith(key));
    if ((await connection.all(CIPHER_VERSION, [])).length === 0) {
      await closeQuietly(connection);
      return err(UNLOCK_FAILURE.EncryptionUnavailable);
    }
    await connection.all(READ_SCHEMA, []);
    return ok(undefined);
  } catch (error) {
    await closeQuietly(connection);
    return err(isNotADatabase(error) ? UNLOCK_FAILURE.KeyRejected : UNLOCK_FAILURE.Failed);
  }
}

function isNotADatabase(error: unknown): boolean {
  if (error instanceof Error && NOT_A_DATABASE.test(error.message)) return true;
  return describeFailure(error) === NOT_A_DATABASE_CODE;
}

async function closeQuietly(connection: EngineConnection): Promise<void> {
  try {
    await connection.close();
  } catch {
    // Nothing more can be done for a database that does not close.
  }
}
