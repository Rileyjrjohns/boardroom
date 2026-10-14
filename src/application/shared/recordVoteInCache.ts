import { withVoteRecorded } from '@domain/entities/Meeting';
import type { Vote } from '@domain/entities/Vote';
import { isErr } from '@domain/shared/Result';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from '../ports/Monitoring';

import { CACHE_RESOURCE } from './CacheResource';
import { requireSameUser } from './requireSession';
import type { RequireSessionDeps } from './requireSession';

/**
 * Once the server has recorded a vote, records it on the cached copy of its meeting too
 * (`withVoteRecorded`), so that the copy shows the vote and the voter cannot vote again from it
 * while offline. The copy keeps the date it was cached at: updating it does not make it younger.
 *
 * A meeting that is not cached is fine, there is nothing to update. A cache that cannot be read or
 * written is captured and does not fail anything: the server has recorded the vote and refuses a
 * second one anyway.
 *
 * The read and the write are two awaits, and a sign-out (which empties the caches) can happen
 * between them. The voter is checked again in between (`requireSameUser`), and nothing is written
 * unless the same user is still signed in and the app is not locked: writing the copy back would
 * put the meeting of a user who left on the device again, after the purge that removed it.
 */
export async function recordVoteInCache(deps: RequireSessionDeps, vote: Vote): Promise<void> {
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

  const stillTheVoter = await requireSameUser(deps, vote.voterId);
  if (isErr(stillTheVoter)) return;

  const saved = await meetingCache.saveMeeting(
    vote.voterId,
    withVoteRecorded(cached.value.value, vote),
    cached.value.cachedAt,
  );
  if (isErr(saved)) {
    monitoring.captureError(MONITORING_EVENT.CacheWriteFailed, saved.error, attributes);
  }
}
