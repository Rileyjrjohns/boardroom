import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import { attempt } from '../shared/attempt';
import { createSerialQueue } from '../shared/serialQueue';
import type { SerialQueue } from '../shared/serialQueue';
import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';
import type { SecureStorage } from '../secure-storage/SecureStorage';

import { FIRST_GENERATION, databaseFileName, formatKeyState, parseKeyState } from './databaseKey';
import type { KeyState } from './databaseKey';
import { CONNECTION_PRAGMAS } from './DatabaseOpener';
import type { DatabaseOpener } from './DatabaseOpener';
import { RESET_REASON, markLocalDataReset } from './localDataReset';
import type { ResetReason } from './localDataReset';
import { MIGRATION_FAILURE, runMigrations } from './migrate';
import type { Migration } from './migrate';
import { KEY_BYTES, keyFromBytes } from './randomKey';
import type { RandomBytes } from './randomKey';
import { createSqlDatabase } from './SqlDatabase';
import type { SqlConnection, SqlDatabase } from './SqlDatabase';
import { UNLOCK_FAILURE, unlockDatabase } from './unlockDatabase';
import type { UnlockFailure } from './unlockDatabase';

/** How long opening the database, or the keychain, may take before the app gives up. */
const DEFAULT_OPEN_TIMEOUT_MILLIS = 20_000;

const DATABASE_ERROR_CODE = { Unavailable: 'databaseUnavailable' } as const;

export const DATABASE_FAILURE = {
  /**
   * The keychain cannot be read or written, what it holds for the database is not a key, or no key
   * can be made: the key cannot be had.
   */
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

const unavailable = (reason: DatabaseFailureReason): DatabaseUnavailable => ({
  code: DATABASE_ERROR_CODE.Unavailable,
  reason,
});

export interface ProtectedDatabaseOptions {
  readonly opener: DatabaseOpener;
  /** Where the key lives. */
  readonly storage: SecureStorage;
  /** Where the bits of a key come from: the secure random generator of the platform. */
  readonly randomBytes: RandomBytes;
  readonly monitoring: Monitoring;
  /** The name of the first database file (see `databaseFileName`). */
  readonly name: string;
  readonly migrations: readonly Migration[];
  /** Defaults to `DEFAULT_OPEN_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * Starts that wait for each other, one queue for each keychain. The key and the file it opens are
 * a state kept in two places; two starts at once on the same keychain would each find no key, each
 * make one, and leave a key that does not open the file the other created. A start runs only when
 * the one before it is over, and finds the state it left.
 */
const startsOfKeychain = new WeakMap<SecureStorage, SerialQueue>();

function queueOf(storage: SecureStorage): SerialQueue {
  const known = startsOfKeychain.get(storage);
  if (known !== undefined) return known;
  const created = createSerialQueue();
  startsOfKeychain.set(storage, created);
  return created;
}

/**
 * Opens the local database, protected by a key that only the secure storage holds, and brings its
 * schema up to date. It is the one place that decides what to do with the key. Starts are one at a
 * time for a keychain (see `startsOfKeychain`).
 *
 * - **First start.** There is no key and no file. A key is made (256 random bits from the secure
 *   generator of the platform, see `randomKey`), stored first, then the database is created with it. If the app stops in between,
 *   the next start finds a key and no file, and creates it.
 * - **Every start after.** The key is read and the database opened with it.
 * - **A keychain that cannot be trusted.** What is stored under the key of the database is there
 *   and is not a key: that is a failure of the keychain (`keyStorage`), not a lost key. Nothing is
 *   made, set aside or deleted.
 * - **The key is lost** (the keychain was cleared, or the file was restored onto a device whose
 *   keychain does not have the key: the key is device-only on purpose) **or rejected** (the file is
 *   not the one the key belongs to, or is not a database). The content of the file cannot be read.
 *   It is not deleted: the app sets it aside and starts a new database, and everything that was
 *   in the old one is not in the new one, votes that had not been sent included.
 *   1. The record that local data was reset is written to the keychain (see `localDataReset`), the
 *      first thing, so that whatever happens next, the user is told.
 *   2. The key that did not open the file is kept, in another item.
 *   3. A new key and the next generation of the file are stored in one write, which is the point
 *      of no return: the app now looks for its data in a file of another name
 *      (`databaseFileName`), and the one it could not read stays where it is.
 *   4. The reset is captured by the monitoring as an error, not as a log.
 *   5. Once the new database is open and migrated, the copy that was set aside by the reset before
 *      this one, if any, is removed: **at most one copy of an unreadable database is kept**, the
 *      latest. There is no rename in the engine, so a name is never reused, which also means a
 *      leftover journal of the old file cannot be applied to the new one.
 *   It happens at most once in a start. A start that stops anywhere in it finds the state of the
 *   last write and goes on from there.
 * - **Rotation.** The key is made once for a file, and replaced only in the case above. Nothing
 *   rotates it while the database is in use: that would be `PRAGMA rekey` with the new key written
 *   to the keychain first, which no policy of the app asks for (see "Persistence" in
 *   docs/design-in-depth.md).
 * - **No encryption.** An engine that cannot encrypt (plain SQLite: the native build lacks the
 *   `useSQLCipher` option of the `expo-sqlite` plugin) fails the start with `encryptionUnavailable`:
 *   confidential data is never written in clear because the build was wrong.
 *
 * Never throws. A start that fails with the keychain or the engine is `databaseUnavailable` with
 * the reason; the app then does not start (the container reports it) and nothing is deleted.
 */
export function openProtectedDatabase(
  options: ProtectedDatabaseOptions,
): Promise<Result<SqlDatabase, DatabaseUnavailable>> {
  return queueOf(options.storage)(() => start(options));
}

async function start(
  options: ProtectedDatabaseOptions,
): Promise<Result<SqlDatabase, DatabaseUnavailable>> {
  const { opener, name, migrations } = options;
  const timeout = options.timeoutMillis ?? DEFAULT_OPEN_TIMEOUT_MILLIS;

  const held = await readKeyState(options.storage, timeout);
  if (!held.ok) return held;

  let state = held.value;
  if (state === undefined) {
    const made = await makeState(options, FIRST_GENERATION, timeout);
    if (!made.ok) return made;
    state = made.value;
  }

  let opened = await openUnlocked(
    opener,
    databaseFileName(name, state.generation),
    state.key,
    timeout,
  );
  let setAside: number | undefined;
  if (!opened.ok && opened.error === UNLOCK_FAILURE.KeyRejected) {
    const reason = held.value === undefined ? RESET_REASON.KeyLost : RESET_REASON.KeyRejected;
    const next = await setAsideAndRenew(options, state, held.value !== undefined, reason, timeout);
    if (!next.ok) return next;
    setAside = state.generation;
    opened = await openUnlocked(
      opener,
      databaseFileName(name, next.value.generation),
      next.value.key,
      timeout,
    );
  }
  if (!opened.ok) {
    return err(
      unavailable(
        opened.error === UNLOCK_FAILURE.EncryptionUnavailable
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
  if (setAside !== undefined) await removeOlderCopy(options, setAside, timeout);
  return ok(database);
}

/**
 * Sets the file that could not be read aside and gives the app a new key and the next file, as
 * `openProtectedDatabase` describes. `previous` says whether the key that failed came from the
 * keychain (and is worth keeping) or was made a moment ago for a file that was not there to be
 * found.
 */
async function setAsideAndRenew(
  options: ProtectedDatabaseOptions,
  current: KeyState,
  keepsKey: boolean,
  reason: ResetReason,
  timeout: number,
): Promise<Result<KeyState, DatabaseUnavailable>> {
  const { storage, monitoring } = options;

  if (!(await markLocalDataReset(storage, reason, timeout))) {
    return err(unavailable(DATABASE_FAILURE.KeyStorage));
  }
  if (keepsKey) {
    // Best effort: the file is kept either way, and the key only makes it readable if the cause
    // turns out to be somewhere else than the file.
    await attempt(
      () => storage.set(SECURE_STORAGE_KEY.DatabaseKeyPrevious, formatKeyState(current)),
      timeout,
    );
  }
  const renewed = await makeState(options, current.generation + 1, timeout);
  if (!renewed.ok) return renewed;

  monitoring.captureError(MONITORING_EVENT.DatabaseRecreated, storageReadFailed(reason), {
    [LOG_ATTRIBUTE.Reason]: reason,
  });
  return renewed;
}

/** Removes the copy that an earlier reset set aside, now that there is another one. Best effort. */
async function removeOlderCopy(
  options: ProtectedDatabaseOptions,
  setAside: number,
  timeout: number,
): Promise<void> {
  const older = setAside - 1;
  if (older < FIRST_GENERATION) return;
  await attempt(() => options.opener.remove(databaseFileName(options.name, older)), timeout);
}

/** Opens the file and unlocks it. A file that cannot be opened is `failed`. */
async function openUnlocked(
  opener: DatabaseOpener,
  file: string,
  key: string,
  timeout: number,
): Promise<Result<SqlConnection, UnlockFailure>> {
  const opened = await attempt(() => opener.open(file), timeout);
  if (!opened.ok) return err(UNLOCK_FAILURE.Failed);

  const unlocked = await attempt(() => unlockDatabase(opened.value, key), timeout);
  if (!unlocked.ok) {
    await attempt(() => opened.value.close(), timeout);
    return err(UNLOCK_FAILURE.Failed);
  }
  return unlocked.value.ok ? ok(opened.value) : unlocked.value;
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

/**
 * The state in the keychain, or `undefined` when there is none. An item that is there and is not a
 * state is a failure of the keychain: starting over would set aside a database that a key opens.
 */
async function readKeyState(
  storage: SecureStorage,
  timeout: number,
): Promise<Result<KeyState | undefined, DatabaseUnavailable>> {
  const read = await attempt(() => storage.get(SECURE_STORAGE_KEY.DatabaseKey), timeout);
  if (!read.ok) return err(unavailable(DATABASE_FAILURE.KeyStorage));
  if (read.value === undefined) return ok(undefined);

  const state = parseKeyState(read.value);
  return state === undefined ? err(unavailable(DATABASE_FAILURE.KeyStorage)) : ok(state);
}

/** Makes a key and stores it with the generation. The key is used only once it is safe in the keychain. */
async function makeState(
  options: ProtectedDatabaseOptions,
  generation: number,
  timeout: number,
): Promise<Result<KeyState, DatabaseUnavailable>> {
  const key = await randomKey(options.randomBytes, timeout);
  if (!key.ok) return key;

  const state: KeyState = { generation, key: key.value };
  const stored = await attempt(
    () => options.storage.set(SECURE_STORAGE_KEY.DatabaseKey, formatKeyState(state)),
    timeout,
  );
  return stored.ok ? ok(state) : err(unavailable(DATABASE_FAILURE.KeyStorage));
}

/**
 * 256 random bits as hexadecimal digits (`keyFromBytes`), drawn from the secure generator of the
 * platform that the options hand over (`expo-crypto` on a device). That generator rejects when it
 * cannot do its job, and never answers with weaker bytes, so there is nothing to detect here but
 * an answer that is not a key: which is a failure of the key storage like any other, and nothing
 * is made, stored or opened.
 */
async function randomKey(
  randomBytes: RandomBytes,
  timeout: number,
): Promise<Result<string, DatabaseUnavailable>> {
  const drawn = await attempt(() => randomBytes(KEY_BYTES), timeout);
  const key = drawn.ok ? keyFromBytes(drawn.value) : undefined;
  return key === undefined ? err(unavailable(DATABASE_FAILURE.KeyStorage)) : ok(key);
}
