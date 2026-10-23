import type { SessionDataPurger } from '@features/auth/application/ports/SessionDataPurger';
import { DocumentCachePurger } from '@features/documents/application/DocumentCachePurger';
import type { DocumentCache } from '@features/documents/application/ports/DocumentCache';
import { MeetingCachePurger } from '@features/meetings/application/MeetingCachePurger';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';

/**
 * Everything a session leaves on the device, as one purger for each feature that keeps data for a
 * user: the list that `purgeCaches` of `auth` runs when a session ends. `auth` declares the port
 * and does not know the features, so it is here, where every feature is known, that the list is
 * made. The order is the one the caches have always been emptied in: the meetings, then the
 * documents.
 */
export function sessionDataPurgers(caches: {
  readonly meetingCache: MeetingCache;
  readonly documentCache: DocumentCache;
}): readonly SessionDataPurger[] {
  return [
    new MeetingCachePurger(caches.meetingCache),
    new DocumentCachePurger(caches.documentCache),
  ];
}
