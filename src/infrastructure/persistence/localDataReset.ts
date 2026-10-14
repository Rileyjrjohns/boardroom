import { MONITORING_EVENT } from '@application/ports/Monitoring';
import type { Monitoring } from '@application/ports/Monitoring';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';

import { attempt } from '../shared/attempt';
import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';
import type { SecureStorage } from '../secure-storage/SecureStorage';

/** Why the local data was reset. */
export const RESET_REASON = {
  /** The key was not in the keychain, and a database was: it could not be opened. */
  KeyLost: 'keyLost',
  /** The keychain had a key, and it did not open the database. */
  KeyRejected: 'keyRejected',
} as const;

export type ResetReason = (typeof RESET_REASON)[keyof typeof RESET_REASON];

/**
 * The record that local data was reset, kept in the secure storage, which a reset of the database
 * does not touch. It is written before anything is set aside and stays until the user has been told
 * (`clearLocalDataReset`), so that an app that stops in the middle of a reset, or that is closed
 * before the user sees the notice, tells them at the next start.
 *
 * It holds the reason and nothing else. Its absence is the normal case.
 */
export async function markLocalDataReset(
  storage: SecureStorage,
  reason: ResetReason,
  timeoutMillis: number,
): Promise<boolean> {
  const written = await attempt(
    () => storage.set(SECURE_STORAGE_KEY.LocalDataReset, reason),
    timeoutMillis,
  );
  return written.ok;
}

/**
 * Whether local data was reset and the user has not been told. A keychain that cannot be read is
 * captured and counts as no: the notice is an extra, and the start does not wait on it.
 */
export async function hasLocalDataReset(
  storage: SecureStorage,
  monitoring: Monitoring,
  timeoutMillis: number,
): Promise<boolean> {
  const read = await attempt(() => storage.get(SECURE_STORAGE_KEY.LocalDataReset), timeoutMillis);
  if (!read.ok) {
    monitoring.captureError(
      MONITORING_EVENT.ResetNoticeUnreadable,
      storageReadFailed(read.error.cause),
    );
    return false;
  }
  return read.value !== undefined;
}

/** Forgets that local data was reset, once the user has been told. Whether it worked is told. */
export async function clearLocalDataReset(
  storage: SecureStorage,
  timeoutMillis: number,
): Promise<boolean> {
  const removed = await attempt(
    () => storage.remove(SECURE_STORAGE_KEY.LocalDataReset),
    timeoutMillis,
  );
  return removed.ok;
}

/** How long the keychain may take to answer about the record before the start goes on without it. */
const NOTICE_TIMEOUT_MILLIS = 5000;

/** What the app tells the user about a reset of its local data, and the means to say it was told. */
export interface LocalDataResetNotice {
  /** Whether local data was reset and the user has not been told yet. */
  readonly pending: boolean;
  /**
   * The user has been told: the record is cleared, and they will not be told again. A record that
   * cannot be cleared is captured, and the user is told again at the next start. Never rejects.
   */
  acknowledge(): Promise<void>;
}

/** Reads the record once, at the start, and gives the notice that follows from it. */
export async function readLocalDataResetNotice(
  storage: SecureStorage,
  monitoring: Monitoring,
  timeoutMillis: number = NOTICE_TIMEOUT_MILLIS,
): Promise<LocalDataResetNotice> {
  const pending = await hasLocalDataReset(storage, monitoring, timeoutMillis);
  return {
    pending,
    acknowledge: async () => {
      if (!(await clearLocalDataReset(storage, timeoutMillis))) {
        monitoring.captureError(MONITORING_EVENT.ResetNoticeNotCleared, storageWriteFailed());
      }
    },
  };
}
