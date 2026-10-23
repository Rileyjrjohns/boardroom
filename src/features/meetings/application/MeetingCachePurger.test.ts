import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { FakeMeetingCache } from '@features/meetings/application/testing/FakeMeetingCache';
import { NOW, aMeeting, aUserId } from '@testing/domain/builders';

import { MeetingCachePurger } from './MeetingCachePurger';

describe('MeetingCachePurger', () => {
  it('names the meetings as what it empties, for the monitoring', () => {
    expect(new MeetingCachePurger(new FakeMeetingCache()).resource).toBe(CACHE_RESOURCE.Meeting);
  });

  it('empties the cache of the meetings, for every owner', async () => {
    const cache = new FakeMeetingCache();
    await cache.saveMeeting(aUserId('user-1'), aMeeting(), NOW);
    await cache.saveMeeting(aUserId('user-2'), aMeeting(), NOW);

    const purged = await new MeetingCachePurger(cache).purge();

    expect(purged).toEqual(ok(undefined));
    expect(cache.isEmpty()).toBe(true);
  });

  it('gives the failure of a cache that cannot be emptied', async () => {
    const cache = new FakeMeetingCache();
    cache.purgeFailure = storageWriteFailed('locked');

    expect(await new MeetingCachePurger(cache).purge()).toEqual(err(storageWriteFailed('locked')));
  });
});
