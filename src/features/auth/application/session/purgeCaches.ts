import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { isErr } from '@core/domain/shared/Result';
import type { DocumentCache } from '@features/documents/application/ports/DocumentCache';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';

export interface PurgeCachesDeps {
  readonly meetingCache: MeetingCache;
  readonly documentCache: DocumentCache;
  readonly monitoring: Monitoring;
}

/**
 * Empties the meeting cache and the document cache (the content of the documents included), for
 * every owner. Called when a session ends, so that nothing a user saw stays on the device. Both
 * are always attempted. A failure is captured and never returned: it must not stop a user from
 * signing out.
 */
export async function purgeCaches(deps: PurgeCachesDeps): Promise<void> {
  const { meetingCache, documentCache, monitoring } = deps;

  const meetings = await meetingCache.purge();
  if (isErr(meetings)) {
    monitoring.captureError(MONITORING_EVENT.CachePurgeFailed, meetings.error, {
      [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
    });
  }

  const documents = await documentCache.purge();
  if (isErr(documents)) {
    monitoring.captureError(MONITORING_EVENT.CachePurgeFailed, documents.error, {
      [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Document,
    });
  }
}
