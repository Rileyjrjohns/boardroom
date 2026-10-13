import { withVoteRecorded } from '@domain/entities/Meeting';
import type { Vote } from '@domain/entities/Vote';
import { isErr } from '@domain/shared/Result';

import type { MeetingCache } from '../ports/MeetingCache';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '../ports/Monitoring';
import type { Monitoring } from '../ports/Monitoring';

import { CACHE_RESOURCE } from './CacheResource';

export interface RecordVoteInCacheDeps {
  readonly meetingCache: MeetingCache;
  readonly monitoring: Monitoring;
}

/**
 * Once the server has recorded a vote, records it on the cached copy of its meeting too
 * (`withVoteRecorded`), so that the copy shows the vote and the voter cannot vote again from it
 * while offline. The copy keeps the date it was cached at: updating it does not make it younger.
 *
 * A meeting that is not cached is fine, there is nothing to update. A cache that cannot be read or
 * written is captured and does not fail anything: the server has recorded the vote and refuses a
 * second one anyway.
 */
export async function recordVoteInCache(deps: RecordVoteInCacheDeps, vote: Vote): Promise<void> {
  const { meetingCache, monitoring } = deps;
  const attributes = {
    [LOG_ATTRIBUTE.MeetingId]: vote.meetingId,
    [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
  };

  const cached = await meetingCache.readMeeting(vote.voterId, vote.meetingId);
  if (isErr(cached)) {
    monitoring.captureError(MONITORING_EVENT.CacheReadFailed, cached.error, attributes);
    return;
  }
  if (cached.value === undefined) return;

  const saved = await meetingCache.saveMeeting(
    vote.voterId,
    withVoteRecorded(cached.value.value, vote),
    cached.value.cachedAt,
  );
  if (isErr(saved)) {
    monitoring.captureError(MONITORING_EVENT.CacheWriteFailed, saved.error, attributes);
  }
}
