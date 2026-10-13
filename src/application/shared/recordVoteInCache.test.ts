import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { findResolution } from '@domain/entities/Meeting';
import { ok } from '@domain/shared/Result';
import { aMeeting, aMeetingId, aResolutionId, aUserId, aVote, at } from '@domain/testing/builders';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from '../ports/Monitoring';
import { createFakes } from '../testing/createFakes';

import { CACHE_RESOURCE } from './loadWithCacheFallback';
import { recordVoteInCache } from './recordVoteInCache';

const VOTE = aVote({ choice: VOTE_CHOICE.Abstain });
const CACHED_AT = at(-5000);
const ATTRIBUTES = {
  [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
  [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
};

describe('recordVoteInCache', () => {
  it('records the vote on the cached meeting of the voter and keeps the date it was cached at', async () => {
    const fakes = createFakes();
    await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), CACHED_AT);
    fakes.clock.advance(60_000);

    await recordVoteInCache(fakes, VOTE);

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

    await recordVoteInCache(fakes, VOTE);

    const cached = await fakes.meetingCache.readMeeting(aUserId('user-2'), aMeetingId());
    expect(cached).toEqual(ok({ value: aMeeting(), cachedAt: CACHED_AT }));
  });

  it('does nothing when the meeting is not cached', async () => {
    const fakes = createFakes();

    await recordVoteInCache(fakes, VOTE);

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([]);
  });

  it('captures a cache that cannot be read, and does not fail', async () => {
    const fakes = createFakes();
    fakes.meetingCache.readFailure = storageReadFailed();

    await recordVoteInCache(fakes, VOTE);

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

    await recordVoteInCache(fakes, VOTE);

    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.CacheWriteFailed,
        error: storageWriteFailed(),
        attributes: ATTRIBUTES,
      },
    ]);
  });
});
