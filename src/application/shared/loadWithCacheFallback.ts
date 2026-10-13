import { isWithinMaxAge } from '@domain/policies/cacheAge';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, isErr, isOk, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { ValueOf } from '@domain/shared/constants';
import type { Duration } from '@domain/value-objects/Duration';
import type { Instant } from '@domain/value-objects/Instant';

import type { CacheEntry } from '../ports/CacheEntry';
import type { Clock } from '../ports/Clock';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../ports/Monitoring';
import type { LogAttributes, Monitoring } from '../ports/Monitoring';

import { FRESHNESS } from './Loaded';
import type { Loaded } from './Loaded';

/** What is being cached, for the logs. */
export const CACHE_RESOURCE = {
  MeetingPage: 'meetingPage',
  Meeting: 'meeting',
  Document: 'document',
} as const;

export type CacheResource = ValueOf<typeof CACHE_RESOURCE>;

export interface CacheFallbackDeps {
  readonly clock: Clock;
  readonly monitoring: Monitoring;
  /**
   * Configuration, set once by the composition root: how old a cached entry may be and still be
   * served as stale data. An older entry counts as a miss.
   */
  readonly maxCacheAge: Duration;
}

/** The remote read of a piece of data, and the cache that mirrors it (for one owner). */
export interface CacheFallbackSource<T, E extends RepositoryError> {
  readonly resource: CacheResource;
  /** Identifies the data in the logs. */
  readonly attributes: LogAttributes;
  fetch(): Promise<Result<T, E>>;
  save(value: T, cachedAt: Instant): Promise<Result<void, StorageWriteFailedError>>;
  read(): Promise<Result<CacheEntry<T> | undefined, StorageReadFailedError>>;
  remove(): Promise<Result<void, StorageWriteFailedError>>;
}

/**
 * The offline policy of the app, in one place. It is business logic, so it lives in the
 * application layer and not in an adapter, where it would be invisible and untested.
 *
 * 1. Read the remote source. On success, write the data through to the cache and return it
 *    `Fresh`. A cache that cannot be written does not fail the call: the failure is captured by the
 *    monitoring, and the fresh data is returned.
 * 2. When the remote source is unreachable (`networkUnavailable`, and only that), read the cache
 *    and return what it holds `Stale`, with the instant it was cached. A cache that cannot be read
 *    is captured and treated as a miss. On a miss the original network error is returned. An entry
 *    older than `maxCacheAge`, or dated in the future, counts as a miss (see `isWithinMaxAge`).
 * 3. When the remote source refuses (`unauthorized`) or says the item is gone (`notFound`), that
 *    answer is authoritative: the entry is evicted from the cache, so the copy cannot be served
 *    later, and the error is returned. An eviction that fails is captured, and the error is still
 *    returned. The cache is never read in this case.
 * 4. Any other error (`unexpected`) is returned as is, and the cache is left alone.
 *
 * Which user the data belongs to is not this function's concern: the source it is given reads, writes
 * and removes for one owner.
 */
export async function loadWithCacheFallback<T, E extends RepositoryError>(
  deps: CacheFallbackDeps,
  source: CacheFallbackSource<T, E>,
): Promise<Result<Loaded<T>, E>> {
  const { clock, monitoring, maxCacheAge } = deps;
  const attributes: LogAttributes = {
    ...source.attributes,
    [LOG_ATTRIBUTE.Resource]: source.resource,
  };

  const remote = await source.fetch();
  if (isOk(remote)) {
    const saved = await source.save(remote.value, clock.now());
    if (isErr(saved)) {
      monitoring.captureError(MONITORING_EVENT.CacheWriteFailed, saved.error, attributes);
    }
    return ok({ data: remote.value, source: { freshness: FRESHNESS.Fresh } });
  }

  const { code } = remote.error;
  if (code === REPOSITORY_ERROR_CODE.Unauthorized || code === REPOSITORY_ERROR_CODE.NotFound) {
    const removed = await source.remove();
    if (isErr(removed)) {
      monitoring.captureError(MONITORING_EVENT.CacheRemoveFailed, removed.error, attributes);
    }
    return remote;
  }
  if (code !== REPOSITORY_ERROR_CODE.NetworkUnavailable) return remote;

  const cached = await source.read();
  if (isErr(cached)) {
    monitoring.captureError(MONITORING_EVENT.CacheReadFailed, cached.error, attributes);
    return err(remote.error);
  }
  const entry = cached.value;
  if (entry === undefined) return err(remote.error);

  if (!isWithinMaxAge(entry.cachedAt, clock.now(), maxCacheAge)) {
    monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.CacheEntryDiscarded, attributes);
    return err(remote.error);
  }

  monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.ServedFromCache, attributes);
  return ok({
    data: entry.value,
    source: { freshness: FRESHNESS.Stale, cachedAt: entry.cachedAt },
  });
}
