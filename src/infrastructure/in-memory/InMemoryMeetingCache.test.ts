import { describeMeetingCacheContract } from '@application/testing/contracts/meetingCacheContract';

import { InMemoryMeetingCache } from './InMemoryMeetingCache';

describeMeetingCacheContract('InMemoryMeetingCache', () => new InMemoryMeetingCache());
