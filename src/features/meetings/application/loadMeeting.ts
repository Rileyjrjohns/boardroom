import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import type { Loaded } from '@core/application/offline/Loaded';
import { loadWithCacheFallback } from '@core/application/offline/loadWithCacheFallback';
import type { CacheFallbackDeps } from '@core/application/offline/loadWithCacheFallback';
import { LOG_ATTRIBUTE } from '@core/application/ports/Monitoring';
import type { RepositoryError } from '@core/domain/errors/RepositoryError';
import type { StorageError } from '@core/domain/errors/StorageError';
import { isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { MeetingId, UserId } from '@core/domain/value-objects/ids';
import type { SessionGateError } from '@features/auth/application/session/AuthSessionGate';
import type { RequireSessionDeps } from '@features/auth/application/session/requireSession';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';

import type { MeetingCache } from './ports/MeetingCache';
import type { MeetingDocumentEvictor } from './ports/MeetingDocumentEvictor';
import type { MeetingRepository } from './ports/MeetingRepository';

/** What `loadMeeting` needs, on top of what the offline policy and the session guard need. */
export interface LoadMeetingDeps extends CacheFallbackDeps<SessionGateError>, RequireSessionDeps {
  readonly meetings: MeetingRepository;
  readonly meetingCache: MeetingCache;
  /** Where the documents of a refused meeting are dropped from the device. */
  readonly documentEvictor: MeetingDocumentEvictor;
}

/**
 * A meeting for `owner`, from the remote source or, when it cannot be reached, from the cache of
 * that owner (see `loadWithCacheFallback`). When the server refuses the meeting (`forbidden`,
 * `notFound`), the cached copy goes, and so do the documents it lists (through the `MeetingDocumentEvictor`): a
 * document of a meeting that the user can no longer see must not stay readable offline.
 */
export function loadMeeting(
  deps: LoadMeetingDeps,
  owner: UserId,
  id: MeetingId,
): Promise<Result<Loaded<Meeting>, RepositoryError | SessionGateError>> {
  return loadWithCacheFallback(deps, owner, {
    resource: CACHE_RESOURCE.Meeting,
    attributes: { [LOG_ATTRIBUTE.MeetingId]: id },
    fetch: () => deps.meetings.get(id),
    save: (meeting, cachedAt) => deps.meetingCache.saveMeeting(owner, meeting, cachedAt),
    read: () => deps.meetingCache.readMeeting(owner, id),
    remove: () => deps.meetingCache.removeMeeting(owner, id),
    revoke: () => revokeMeeting(deps, owner, id),
  });
}

/**
 * Removes the cached meeting and every document it lists. The documents are read from the cached
 * copy, so they go first: the copy is what says which ones they are. A meeting that was never
 * cached lists nothing.
 */
async function revokeMeeting(
  deps: LoadMeetingDeps,
  owner: UserId,
  id: MeetingId,
): Promise<Result<void, StorageError>> {
  const cached = await deps.meetingCache.readMeeting(owner, id);
  if (isErr(cached)) return cached;

  for (const { id: documentId } of cached.value?.value.documents ?? []) {
    const removed = await deps.documentEvictor.evict(owner, documentId);
    if (isErr(removed)) return removed;
  }
  const removed = await deps.meetingCache.removeMeeting(owner, id);
  return isErr(removed) ? removed : ok(undefined);
}
