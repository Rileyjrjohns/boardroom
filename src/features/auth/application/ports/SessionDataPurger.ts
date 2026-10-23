import type { CacheResource } from '@core/application/offline/CacheResource';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';

/**
 * Data a session leaves on the device, purged when the session ends.
 *
 * The session is the business of `auth`, what a user sees and keeps is the business of the other
 * features. So `auth` states the rule ("nothing a user saw stays on the device once the session is
 * over") and declares this port; each feature that keeps data for a user implements it, and the
 * composition hands the list of them to the use cases (see `purgeCaches` and
 * `src/composition/glue/sessionDataPurgers.ts`). A feature added later joins the list without
 * `auth` changing.
 *
 * Contract: `purge` never throws, removes the data of every owner, and succeeds when there is
 * none. It settles in bounded time.
 */
export interface SessionDataPurger {
  /** What this purger empties, as the monitoring names it when the purge fails. */
  readonly resource: CacheResource;

  /** Removes everything this purger is responsible for, for every owner. */
  purge(): Promise<Result<void, StorageWriteFailedError>>;
}
