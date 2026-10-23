import type { Result } from '@core/domain/shared/Result';
import type {
  VoteRepository,
  VoteSubmissionError,
} from '@features/votes/application/ports/VoteRepository';
import type { Vote } from '@features/votes/domain/entities/Vote';

import type { InMemoryBackend } from './InMemoryBackend';

/** The votes of the simulated server. A thin window on the backend it shares with the others. */
export class InMemoryVoteRepository implements VoteRepository {
  constructor(private readonly backend: InMemoryBackend) {}

  submit(vote: Vote): Promise<Result<void, VoteSubmissionError>> {
    return this.backend.submitVote(vote);
  }
}
