import { AUTHENTICATION_ERROR_CODE } from '@core/domain/errors/AuthenticationError';
import type { SessionChangedError } from '@core/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import type {
  StorageError,
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import { isWithinMaxAge } from '@core/domain/policies/cacheAge';
import { err, isErr, isOk, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Duration } from '@core/domain/value-objects/Duration';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { UserId } from '@core/domain/value-objects/ids';
import { endRefusedSession } from '@features/auth/application/session/endSession';
import { purgeCaches } from '@features/auth/application/session/purgeCaches';
import { requireSameUser } from '@features/auth/application/session/requireSession';
import type {
  RequireSessionDeps,
  SessionRequiredError,
} from '@features/auth/application/session/requireSession';

import type { CacheEntry } from '../ports/types/CacheEntry';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../ports/Monitoring';
import type { LogAttributes } from '../ports/Monitoring';

import type { CacheResource } from './CacheResource';
import { FRESHNESS } from './Loaded';
import type { Loaded } from './Loaded';

export interface CacheFallbackDeps extends RequireSessionDeps {
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
  /** Drops this entry and nothing else. Used when the entry could not be refreshed. */
  remove(): Promise<Result<void, StorageWriteFailedError>>;
  /**
   * Drops this entry and what hangs off it, because the server no longer lets the user have the
   * item: a meeting takes the documents it lists with it. Used on `forbidden` and `notFound`.
   */
  revoke(): Promise<Result<void, StorageError>>;
}

/**
 * The offline policy of the app, in one place. It is business logic, so it lives in the
 * application layer and not in an adapter, where it would be invisible and untested.
 *
 * 1. Read the remote source. Then check that the user it was read for is still the one signed in
 *    (and the app still unlocked): a request can take long, and a sign-out and a sign-in can fall
 *    in the middle of it. If somebody else is signed in now, nothing is written, nothing is
 *    returned, and the answer is `sessionChanged`. If the remote call had succeeded, what it may
 *    have left on the device (the file of a downloaded document, which no entry points at) is
 *    removed by emptying both caches, unless the answer is `appLocked`: the user is the same and
 *    comes back.
 * 2. On success, write the data through to the cache and return it `Fresh`. A cache that cannot be
 *    written does not fail the call: the failure is captured, the fresh data is returned, and the
 *    entry is removed (a copy that could not be refreshed must not stay readable as if it were
 *    current), with a full purge if even that fails.
 * 3. When the remote source is unreachable (`networkUnavailable`, and only that), read the cache
 *    and return what it holds `Stale`, with the instant it was cached. A cache that cannot be read
 *    is captured and treated as a miss. On a miss the original network error is returned. An entry
 *    older than `maxCacheAge`, or dated in the future, counts as a miss (see `isWithinMaxAge`).
 * 4. `unauthorized` means the session is no longer valid, for anything: the session is ended on
 *    the device (`endRefusedSession`: the app is locked, both caches are emptied for every owner,
 *    and the user is signed out, so that a restart does not restore it). `forbidden` and
 *    `notFound` concern one item: it is dropped from the cache
 *    with what hangs off it (`revoke`). A removal that fails is captured and falls back on the
 *    full purge, so that a copy the server refused is never served afterwards; a purge that fails
 *    is captured. The error is returned in every case, and the cache is never read.
 * 5. Any other error (`unexpected`) is returned as is, and the cache is left alone.
 *
 * Known limit: pages of a list that were cached are not walked. A page that shows the title of a
 * meeting that became forbidden keeps showing it until it is refreshed or expires; opening the
 * meeting is refused, and its detail and documents are gone.
 */
export async function loadWithCacheFallback<T, E extends RepositoryError>(
  deps: CacheFallbackDeps,
  owner: UserId,
  source: CacheFallbackSource<T, E>,
): Promise<Result<Loaded<T>, E | SessionRequiredError | SessionChangedError>> {
  const { clock, monitoring, maxCacheAge } = deps;
  const attributes: LogAttributes = {
    ...source.attributes,
    [LOG_ATTRIBUTE.Resource]: source.resource,
  };

  const remote = await source.fetch();

  const stillSignedIn = await requireSameUser(deps, owner);
  if (isErr(stillSignedIn)) {
    // A source can keep what it fetched before this function sees it (the repository of the
    // documents writes the file as soon as the download is complete), and nothing points at it:
    // no entry is saved. Nobody must be left with it, so both caches are emptied, the files of
    // the documents with them. Not when the app is only locked: the user is still the one who
    // asked, and the cache they have is theirs. A failed remote call kept nothing.
    if (isOk(remote) && stillSignedIn.error.code !== AUTHENTICATION_ERROR_CODE.AppLocked) {
      await purgeCaches(deps);
    }
    return stillSignedIn;
  }

  if (isOk(remote)) {
    const loadedAt = clock.now();
    const saved = await source.save(remote.value, loadedAt);
    if (isErr(saved)) {
      monitoring.captureError(MONITORING_EVENT.CacheWriteFailed, saved.error, attributes);
      await dropOrPurge(deps, source.remove, attributes);
    }
    return ok({ data: remote.value, source: { freshness: FRESHNESS.Fresh }, loadedAt });
  }

  const { code } = remote.error;
  if (code === REPOSITORY_ERROR_CODE.Unauthorized) {
    await endRefusedSession(deps, owner);
    return remote;
  }
  if (code === REPOSITORY_ERROR_CODE.Forbidden || code === REPOSITORY_ERROR_CODE.NotFound) {
    await dropOrPurge(deps, source.revoke, attributes);
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

  const loadedAt = clock.now();
  if (!isWithinMaxAge(entry.cachedAt, loadedAt, maxCacheAge)) {
    monitoring.log(LOG_LEVEL.Warn, MONITORING_EVENT.CacheEntryDiscarded, attributes);
    return err(remote.error);
  }

  // Expected behaviour, not a problem: information, so that it does not raise a warning toast.
  monitoring.log(LOG_LEVEL.Info, MONITORING_EVENT.ServedFromCache, attributes);
  return ok({
    data: entry.value,
    source: { freshness: FRESHNESS.Stale, cachedAt: entry.cachedAt },
    loadedAt,
  });
}

/**
 * Drops a copy that must not be served any more. A removal that fails is captured and falls back
 * on emptying both caches, which captures its own failures: the copy is never left behind with
 * nobody told.
 */
async function dropOrPurge(
  deps: CacheFallbackDeps,
  drop: () => Promise<Result<void, StorageError>>,
  attributes: LogAttributes,
): Promise<void> {
  const dropped = await drop();
  if (isErr(dropped)) {
    deps.monitoring.captureError(MONITORING_EVENT.CacheRemoveFailed, dropped.error, attributes);
    await purgeCaches(deps);
  }
}
