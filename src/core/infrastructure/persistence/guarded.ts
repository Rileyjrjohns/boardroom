import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import { attempt } from '../shared/attempt';

/** How long a statement may take before the call is a storage failure. */
export const DEFAULT_STATEMENT_TIMEOUT_MILLIS = 10_000;

/**
 * Runs work against the database for a read: whatever goes wrong, in bounded time, is a
 * `storageReadFailed` whose cause is a kind of failure (see `describeFailure`), never a statement,
 * a path or a value.
 */
export async function guardedRead<T>(
  work: () => Promise<T>,
  timeoutMillis: number,
): Promise<Result<T, StorageReadFailedError>> {
  const done = await attempt(work, timeoutMillis);
  return done.ok ? ok(done.value) : err(storageReadFailed(done.error.cause));
}

/** The same, for a write. */
export async function guardedWrite<T>(
  work: () => Promise<T>,
  timeoutMillis: number,
): Promise<Result<T, StorageWriteFailedError>> {
  const done = await attempt(work, timeoutMillis);
  return done.ok ? ok(done.value) : err(storageWriteFailed(done.error.cause));
}
