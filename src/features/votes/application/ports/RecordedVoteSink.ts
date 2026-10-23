import type { Vote } from '@features/votes/domain/entities/Vote';

/**
 * Where a vote the server recorded is written into the local copy of its meeting.
 *
 * Once the server has accepted a vote, the cached copy of the meeting must show it, so that the
 * voter cannot vote again from the copy while offline. That the copy must be kept truthful is a
 * rule of the votes; where the copy is, and how a vote is written into a meeting, is the business
 * of the meetings. So the votes state the rule and declare this port, and the composition
 * (`MeetingCacheVoteRecorder`, in `src/composition/glue`) implements it over the meeting cache.
 */
export interface RecordedVoteSink {
  /**
   * Records `vote` on the cached copy of its meeting, keeping the date the copy was cached at.
   * Nothing to do is not a failure (the meeting is not cached), and a copy that cannot be read or
   * written is reported by the implementation and never fails the caller: the server has recorded
   * the vote and refuses a second one anyway. Never throws.
   */
  record(vote: Vote): Promise<void>;
}
