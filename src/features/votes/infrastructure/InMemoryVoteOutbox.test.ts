import { IN_MEMORY_STORE } from '@core/application/testing/contracts/support';
import { describeVoteOutboxContract } from '@features/votes/application/testing/contracts/voteOutboxContract';

import { InMemoryVoteOutbox } from './InMemoryVoteOutbox';

describeVoteOutboxContract(
  'InMemoryVoteOutbox',
  () => ({ outbox: new InMemoryVoteOutbox() }),
  // It holds its entries as typed values: none can be unreadable.
  { ...IN_MEMORY_STORE, holdsUnreadable: false },
);
