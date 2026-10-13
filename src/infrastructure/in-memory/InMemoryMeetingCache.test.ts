import { describeMeetingCacheContract } from '@application/testing/contracts/meetingCacheContract';
import { storageWriteFailed } from '@domain/errors/StorageError';

import { InMemoryMeetingCache } from './InMemoryMeetingCache';

describeMeetingCacheContract('InMemoryMeetingCache', () => {
  const cache = new InMemoryMeetingCache();
  return {
    cache,
    breakWrites: () => cache.failWritesWith(storageWriteFailed()),
    repairWrites: () => cache.failWritesWith(undefined),
  };
});
