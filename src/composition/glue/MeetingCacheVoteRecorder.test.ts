import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { ok } from '@core/domain/shared/Result';
import { closeSession } from '@features/auth/application/session/endSession';
import { HoldingMeetingCache } from '@features/meetings/application/testing/HoldingMeetingCache';
import { findResolution } from '@features/meetings/domain/entities/Meeting';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { createFakes } from '@testing/application/createFakes';
import {
  aMeeting,
  aMeetingId,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
  at,
} from '@testing/domain/builders';

import { MeetingCacheVoteRecorder } from './MeetingCacheVoteRecorder';

const VOTE = aVote({ choice: VOTE_CHOICE.Abstain });
const CACHED_AT = at(-5000);
const ATTRIBUTES = {
  [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
  [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
};

describe('MeetingCacheVoteRecorder', () => {
  it('records the vote on the cached meeting of the voter and keeps the date it was cached at', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
    fakes.clock.advance(60_000);

    await new MeetingCacheVoteRecorder(fakes.meetingCache, fakes).record(VOTE);

    const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
    expect(cached.ok && cached.value?.cachedAt).toBe(CACHED_AT);
    expect(
      cached.ok &&
        cached.value &&
        findResolution(cached.value.value, aResolutionId())?.recordedVote,
    ).toBe(VOTE_CHOICE.Abstain);
  });

  it('does not touch the cached meeting of another user', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.saveMeeting(aUserId('user-2'), aMeeting(), CACHED_AT);

    await new MeetingCacheVoteRecorder(fakes.meetingCache, fakes).record(VOTE);

    const cached = await fakes.meetingCache.readMeeting(aUserId('user-2'), aMeetingId());
    expect(cached).toEqual(ok({ value: aMeeting(), cachedAt: CACHED_AT }));
  });

  it('does nothing when the meeting is not cached', async () => {
    const fakes = createFakes();

    await new MeetingCacheVoteRecorder(fakes.meetingCache, fakes).record(VOTE);

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([]);
  });

  it('captures a cache that cannot be read, and does not fail', async () => {
    const fakes = createFakes();
    fakes.meetingCache.readFailure = storageReadFailed();

    await new MeetingCacheVoteRecorder(fakes.meetingCache, fakes).record(VOTE);

    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CacheReadFailed,
        error: storageReadFailed(),
        attributes: ATTRIBUTES,
      },
    ]);
  });

  it('captures a cache that cannot be written, and does not fail', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
    fakes.meetingCache.writeFailure = storageWriteFailed();

    await new MeetingCacheVoteRecorder(fakes.meetingCache, fakes).record(VOTE);

    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CacheWriteFailed,
        error: storageWriteFailed(),
        attributes: ATTRIBUTES,
      },
    ]);
  });

  describe('when the user changes while the meeting is being read', () => {
    it('writes nothing back after the user signed out and the caches were emptied', async () => {
      const fakes = createFakes();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
      const cache = new HoldingMeetingCache(fakes.meetingCache);
      const held = cache.holdNextRead();

      const recording = new MeetingCacheVoteRecorder(cache, fakes).record(VOTE);
      await held.hasAnswered;
      await closeSession(fakes);
      expect(fakes.meetingCache.isEmpty()).toBe(true);
      held.release();
      await recording;

      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('writes nothing back after somebody else signed in', async () => {
      const fakes = createFakes();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
      const cache = new HoldingMeetingCache(fakes.meetingCache);
      const held = cache.holdNextRead();

      const recording = new MeetingCacheVoteRecorder(cache, fakes).record(VOTE);
      await held.hasAnswered;
      fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
      await fakes.meetingCache.purge();
      held.release();
      await recording;

      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('writes nothing back while the app is locked', async () => {
      const fakes = createFakes();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
      const cache = new HoldingMeetingCache(fakes.meetingCache);
      const held = cache.holdNextRead();

      const recording = new MeetingCacheVoteRecorder(cache, fakes).record(VOTE);
      await held.hasAnswered;
      fakes.appLock.lock();
      await fakes.meetingCache.purge();
      held.release();
      await recording;

      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('still writes the vote when the same user is still signed in after the read', async () => {
      const fakes = createFakes();
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
      const cache = new HoldingMeetingCache(fakes.meetingCache);
      const held = cache.holdNextRead();

      const recording = new MeetingCacheVoteRecorder(cache, fakes).record(VOTE);
      await held.hasAnswered;
      held.release();
      await recording;

      const cached = await fakes.meetingCache.readMeeting(aUserId(), aMeetingId());
      expect(
        cached.ok &&
          cached.value &&
          findResolution(cached.value.value, aResolutionId())?.recordedVote,
      ).toBe(VOTE_CHOICE.Abstain);
    });
  });
});
