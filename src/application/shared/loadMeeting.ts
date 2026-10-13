import type { Meeting } from '@domain/entities/Meeting';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import type { Result } from '@domain/shared/Result';
import type { MeetingId, UserId } from '@domain/value-objects/ids';

import type { MeetingCache } from '../ports/MeetingCache';
import type { MeetingRepository } from '../ports/MeetingRepository';
import { LOG_ATTRIBUTE } from '../ports/Monitoring';

import type { Loaded } from './Loaded';
import { CACHE_RESOURCE, loadWithCacheFallback } from './loadWithCacheFallback';
import type { CacheFallbackDeps } from './loadWithCacheFallback';

export interface LoadMeetingDeps extends CacheFallbackDeps {
  readonly meetings: MeetingRepository;
  readonly meetingCache: MeetingCache;
}

/**
 * A meeting for `owner`, from the remote source or, when it cannot be reached, from the cache of
 * that owner (see `loadWithCacheFallback`).
 */
export function loadMeeting(
  deps: LoadMeetingDeps,
  owner: UserId,
  id: MeetingId,
): Promise<Result<Loaded<Meeting>, RepositoryError>> {
  return loadWithCacheFallback(deps, {
    resource: CACHE_RESOURCE.Meeting,
    attributes: { [LOG_ATTRIBUTE.MeetingId]: id },
    fetch: () => deps.meetings.get(id),
    save: (meeting, cachedAt) => deps.meetingCache.saveMeeting(owner, meeting, cachedAt),
    read: () => deps.meetingCache.readMeeting(owner, id),
    remove: () => deps.meetingCache.removeMeeting(owner, id),
  });
}
