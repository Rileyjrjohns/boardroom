import { describeVoteOutboxContract } from '@application/testing/contracts/voteOutboxContract';

import { InMemoryVoteOutbox } from './InMemoryVoteOutbox';

describeVoteOutboxContract('InMemoryVoteOutbox', () => new InMemoryVoteOutbox());
