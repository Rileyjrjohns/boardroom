import { IN_MEMORY_STORE } from '@core/application/testing/contracts/support';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { describeMeetingCacheContract } from '@features/meetings/application/testing/contracts/meetingCacheContract';

import { InMemoryMeetingCache } from './InMemoryMeetingCache';

describeMeetingCacheContract(
  'InMemoryMeetingCache',
  () => {
    const cache = new InMemoryMeetingCache();
    return {
      cache,
      breakWrites: () => cache.failWritesWith(storageWriteFailed()),
      repairWrites: () => cache.failWritesWith(undefined),
    };
  },
  IN_MEMORY_STORE,
);
