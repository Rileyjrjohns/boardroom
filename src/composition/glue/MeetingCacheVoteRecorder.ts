import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { isErr } from '@core/domain/shared/Result';
import { requireSameUser } from '@features/auth/application/session/requireSession';
import type { RequireSessionDeps } from '@features/auth/application/session/requireSession';
import type { MeetingCache } from '@features/meetings/application/ports/MeetingCache';
import type { RecordedVoteSink } from '@features/votes/application/ports/RecordedVoteSink';
import type { Vote } from '@features/votes/domain/entities/Vote';
import { withVoteRecorded } from '@features/votes/domain/withVoteRecorded';

/**
 * Records a vote the server accepted on the cached copy of its meeting (`withVoteRecorded`), so
 * that the copy shows the vote and the voter cannot vote again from it while offline. The copy
 * keeps the date it was cached at: updating it does not make it younger.
 *
 * It is the implementation of the `RecordedVoteSink` port of the votes, over the `MeetingCache` of
 * the meetings and the session guard of `auth`. It is glue between three features, so it lives in
 * the composition and not in one of them.
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
export class MeetingCacheVoteRecorder implements RecordedVoteSink {
  /**
   * `session` is what the session guard needs, and where a failure is reported (the monitoring it
   * holds).
   */
  constructor(
    private readonly meetingCache: MeetingCache,
    private readonly session: RequireSessionDeps,
  ) {}

  async record(vote: Vote): Promise<void> {
    const { meetingCache, session } = this;
    const { monitoring } = session;
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

    const stillTheVoter = await requireSameUser(session, vote.voterId);
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
}
