import { IN_MEMORY_STORE } from '@application/testing/contracts/support';
import { describeVoteOutboxContract } from '@application/testing/contracts/voteOutboxContract';

import { InMemoryVoteOutbox } from './InMemoryVoteOutbox';

describeVoteOutboxContract(
  'InMemoryVoteOutbox',
  () => ({ outbox: new InMemoryVoteOutbox() }),
  IN_MEMORY_STORE,
);
