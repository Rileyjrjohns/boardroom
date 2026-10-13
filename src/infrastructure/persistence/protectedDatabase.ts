import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { Monitoring } from '@application/ports/Monitoring';

import { attempt } from '../shared/attempt';
import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';
import type { SecureStorage } from '../secure-storage/SecureStorage';

import { CONNECTION_PRAGMAS, OPEN_FAILURE } from './DatabaseOpener';
import type { DatabaseOpener } from './DatabaseOpener';
import { MIGRATION_FAILURE, runMigrations } from './migrate';
import type { Migration } from './migrations';
import { createSqlDatabase } from './SqlDatabase';
import type { SqlConnection, SqlDatabase } from './SqlDatabase';

/** How long opening the database, or the keychain, may take before the app gives up. */
const DEFAULT_OPEN_TIMEOUT_MILLIS = 20_000;

const DATABASE_ERROR_CODE = { Unavailable: 'databaseUnavailable' } as const;

export const DATABASE_FAILURE = {
  /** The keychain cannot be read or written, or no key can be made: the key cannot be had. */
  KeyStorage: 'keyStorage',
  /** The engine has no encryption: nothing is stored rather than store the data in clear. */
  EncryptionUnavailable: 'encryptionUnavailable',
  /** The file cannot be opened, though the key is not the reason. */
  Open: 'open',
  /** The schema could not be brought up to date. */
  Migration: 'migration',
  /** The database was written by a more recent version of the app. */
  DatabaseIsNewer: 'databaseIsNewer',
} as const;

export type DatabaseFailureReason = (typeof DATABASE_FAILURE)[keyof typeof DATABASE_FAILURE];

/** The local database cannot be had. Plain data, like every error: the reason, and nothing else. */
export interface DatabaseUnavailable {
  readonly code: typeof DATABASE_ERROR_CODE.Unavailable;
  readonly reason: DatabaseFailureReason;
}

/** Why the database was created again, for the logs. */
export const RECREATION_REASON = {
  /** The key was not in the keychain, and a database was: it could not be opened. */
  KeyLost: 'keyLost',
  /** The keychain had a key, and it did not open the database. */
  KeyRejected: 'keyRejected',
} as const;

type RecreationReason = (typeof RECREATION_REASON)[keyof typeof RECREATION_REASON];

/** A 256-bit key, as 64 lower case hexadecimal digits. */
const KEY_FORMAT = /^[0-9a-f]{64}$/;
const KEY_BYTES = 32;
const RANDOM_KEY = `SELECT lower(hex(randomblob(${KEY_BYTES}))) AS key`;
const KEY_COLUMN = 'key';

const unavailable = (reason: DatabaseFailureReason): DatabaseUnavailable => ({
  code: DATABASE_ERROR_CODE.Unavailable,
  reason,
});

export interface ProtectedDatabaseOptions {
  readonly opener: DatabaseOpener;
  /** Where the key lives. */
  readonly storage: SecureStorage;
  readonly monitoring: Monitoring;
  /** The name of the database file. */
  readonly name: string;
  readonly migrations: readonly Migration[];
  /** Defaults to `DEFAULT_OPEN_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * Opens the local database, protected by a key that only the secure storage holds, and brings its
 * schema up to date. It is the one place that decides what to do with the key:
 *
 * - **First start.** There is no key and no file. A key is made (256 random bits, see
 *   `randomKey`), stored first, then the database is created with it. If the app stops in between,
 *   the next start finds a key and no file, and creates it.
 * - **Every start after.** The key is read and the database opened with it.
 * - **The key is lost** (the keychain was cleared, or the file was restored onto a device whose
 *   keychain does not have the key: the key is device-only on purpose) **or rejected** (the file is
 *   not the one the key belongs to). The content of the file can never be read again, so it is
 *   deleted and a new database is created with a new key. Everything that was in it is gone: the
 *   cache is refilled by the next requests, but a vote that had not been sent is lost. The
 *   monitoring is told, and nothing else is: the app does not start with a database it cannot
 *   read, and does not refuse to start for good either.
 * - **Rotation.** The key is made once for an installation, and replaced only in the case above.
 *   Nothing rotates it while the database is in use: that would be `PRAGMA rekey` with the new key
 *   written to the keychain first, which no policy of the app asks for (see the README).
 * - **No encryption.** An engine that cannot encrypt (plain SQLite: the native build lacks the
 *   `useSQLCipher` option of the `expo-sqlite` plugin) fails the start with `encryptionUnavailable`:
 *   confidential data is never written in clear because the build was wrong.
 *
 * Never throws. A start that fails with the keychain or the engine is `databaseUnavailable` with
 * the reason; the app then does not start (the container reports it) and nothing is deleted.
 */
export async function openProtectedDatabase(
  options: ProtectedDatabaseOptions,
): Promise<Result<SqlDatabase, DatabaseUnavailable>> {
  const { opener, name, migrations } = options;
  const timeout = options.timeoutMillis ?? DEFAULT_OPEN_TIMEOUT_MILLIS;

  const held = await readKey(options.storage, timeout);
  if (!held.ok) return held;

  let key = held.value;
  if (key === undefined) {
    const made = await makeKey(options, timeout);
    if (!made.ok) return made;
    key = made.value;
  }

  let opened = await open(opener, name, key, timeout);
  if (!opened.ok && opened.error === OPEN_FAILURE.KeyRejected) {
    const reason =
      held.value === undefined ? RECREATION_REASON.KeyLost : RECREATION_REASON.KeyRejected;
    opened = await startOver(options, reason, timeout);
  }
  if (!opened.ok) {
    return err(
      unavailable(
        opened.error === OPEN_FAILURE.EncryptionUnavailable
          ? DATABASE_FAILURE.EncryptionUnavailable
          : DATABASE_FAILURE.Open,
      ),
    );
  }

  const database = createSqlDatabase(opened.value);
  const prepared = await prepare(database, migrations);
  if (!prepared.ok) {
    await attempt(() => database.close(), timeout);
    return prepared;
  }
  return ok(database);
}

/** Deletes the file, makes a new key and creates the database again. */
async function startOver(
  options: ProtectedDatabaseOptions,
  reason: RecreationReason,
  timeout: number,
): Promise<Result<SqlConnection, (typeof OPEN_FAILURE)[keyof typeof OPEN_FAILURE]>> {
  const { opener, name, monitoring } = options;
  const deleted = await attempt(() => opener.delete(name), timeout);
  const made = deleted.ok ? await makeKey(options, timeout) : undefined;
  if (made === undefined || !made.ok) return err(OPEN_FAILURE.Failed);

  monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.DatabaseRecreated, {
    [LOG_ATTRIBUTE.Reason]: reason,
  });
  return open(opener, name, made.value, timeout);
}

async function open(
  opener: DatabaseOpener,
  name: string,
  key: string,
  timeout: number,
): Promise<Result<SqlConnection, (typeof OPEN_FAILURE)[keyof typeof OPEN_FAILURE]>> {
  const opened = await attempt(() => opener.open(name, key), timeout);
  return opened.ok ? opened.value : err(OPEN_FAILURE.Failed);
}

/** Sets the connection up and migrates the schema. */
async function prepare(
  database: SqlDatabase,
  migrations: readonly Migration[],
): Promise<Result<void, DatabaseUnavailable>> {
  try {
    await database.run(CONNECTION_PRAGMAS);
  } catch {
    return err(unavailable(DATABASE_FAILURE.Open));
  }
  const migrated = await runMigrations(database, migrations);
  if (migrated.ok) return ok(undefined);
  return err(
    unavailable(
      migrated.error.kind === MIGRATION_FAILURE.DatabaseIsNewer
        ? DATABASE_FAILURE.DatabaseIsNewer
        : DATABASE_FAILURE.Migration,
    ),
  );
}

/** The key in the keychain, or `undefined` when there is none or what is there is not a key. */
async function readKey(
  storage: SecureStorage,
  timeout: number,
): Promise<Result<string | undefined, DatabaseUnavailable>> {
  const read = await attempt(() => storage.get(SECURE_STORAGE_KEY.DatabaseKey), timeout);
  if (!read.ok) return err(unavailable(DATABASE_FAILURE.KeyStorage));
  return ok(read.value !== undefined && KEY_FORMAT.test(read.value) ? read.value : undefined);
}

/** Makes a key and stores it. The key is used only once it is safe in the keychain. */
async function makeKey(
  options: ProtectedDatabaseOptions,
  timeout: number,
): Promise<Result<string, DatabaseUnavailable>> {
  const key = await randomKey(options.opener, timeout);
  if (!key.ok) return key;
  const stored = await attempt(
    () => options.storage.set(SECURE_STORAGE_KEY.DatabaseKey, key.value),
    timeout,
  );
  return stored.ok ? key : err(unavailable(DATABASE_FAILURE.KeyStorage));
}

/**
 * 256 random bits as hexadecimal digits. The platform gives no secure random number to JavaScript
 * that the app can use without a dependency (Hermes has no `crypto.getRandomValues`, and the Expo
 * module that has one is not part of this app), so the bits come from the engine: the
 * `randomblob()` function of SQLite, whose generator is seeded from the operating system
 * (`/dev/urandom`). They are asked of a scratch database in memory, never of the database that
 * is being protected.
 */
async function randomKey(
  opener: DatabaseOpener,
  timeout: number,
): Promise<Result<string, DatabaseUnavailable>> {
  const scratch = await attempt(() => opener.openScratch(), timeout);
  if (!scratch.ok) return err(unavailable(DATABASE_FAILURE.KeyStorage));
  try {
    const drawn = await attempt(() => scratch.value.all(RANDOM_KEY, []), timeout);
    const key = drawn.ok ? drawn.value[0]?.[KEY_COLUMN] : undefined;
    return typeof key === 'string' && KEY_FORMAT.test(key)
      ? ok(key)
      : err(unavailable(DATABASE_FAILURE.KeyStorage));
  } finally {
    await attempt(() => scratch.value.close(), timeout);
  }
}
