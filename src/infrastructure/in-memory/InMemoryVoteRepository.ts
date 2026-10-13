import type { Vote } from '@domain/entities/Vote';
import type { Result } from '@domain/shared/Result';
import type { VoteRepository, VoteSubmissionError } from '@application/ports/VoteRepository';

import type { InMemoryBackend } from './InMemoryBackend';

/** The votes of the simulated server. A thin window on the backend it shares with the others. */
export class InMemoryVoteRepository implements VoteRepository {
  constructor(private readonly backend: InMemoryBackend) {}

  submit(vote: Vote): Promise<Result<void, VoteSubmissionError>> {
    return this.backend.submitVote(vote);
  }
}
