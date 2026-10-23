import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { isErr } from '@core/domain/shared/Result';

import type { SessionDataPurger } from '../ports/SessionDataPurger';

export interface PurgeCachesDeps {
  /**
   * Everything a session leaves on the device, one purger for each feature that keeps data for a
   * user. They are purged in this order, and the composition decides it.
   */
  readonly sessionDataPurgers: readonly SessionDataPurger[];
  /** Where a failed purge is reported. */
  readonly monitoring: Monitoring;
}

/**
 * Empties what a session leaves on the device (the meeting cache and the document cache, the
 * content of the documents included), for every owner, through the `SessionDataPurger` of each
 * feature. Called when a session ends, so that nothing a user saw stays on the device. Every
 * purger is always attempted, whatever the one before it did. A failure is captured and never
 * returned: it must not stop a user from signing out.
 */
export async function purgeCaches(deps: PurgeCachesDeps): Promise<void> {
  const { sessionDataPurgers, monitoring } = deps;

  for (const purger of sessionDataPurgers) {
    const purged = await purger.purge();
    if (isErr(purged)) {
      monitoring.captureError(MONITORING_EVENT.CachePurgeFailed, purged.error, {
        [LOG_ATTRIBUTE.Resource]: purger.resource,
      });
    }
  }
}
