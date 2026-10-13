import type { Vote, IdempotencyKey } from '@domain/entities/Vote';
import { networkUnavailable, unauthorized } from '@domain/errors/RepositoryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import type { VoteRepository, VoteSubmissionError } from '../ports/VoteRepository';

import type { FakeAuthSession } from './FakeAuthSession';
import type { FakeNetwork } from './FakeNetwork';

/**
 * A server that records votes and honours the contract of the port: idempotent on the key, and
 * `unauthorized` for a vote whose voter is not the user the request is authenticated as (the
 * session of the fake auth). The answers of the next calls can be scripted, to simulate a refusal
 * or a connection that drops half way through a synchronisation.
 */
export class FakeVoteRepository implements VoteRepository {
  /** Every vote received, including the ones that were refused. */
  readonly received: Vote[] = [];

  /**
   * Called with each vote when it arrives, before the server answers: a test uses it to change
   * the world in the middle of a synchronisation (another user signs in, say).
   */
  onReceive: ((vote: Vote) => void) | undefined;

  private readonly scripted: Result<void, VoteSubmissionError>[] = [];
  private readonly recorded = new Map<IdempotencyKey, Vote>();

  constructor(
    private readonly network: FakeNetwork,
    private readonly auth: FakeAuthSession,
  ) {}

  /** The votes the server holds. */
  recordedVotes(): Vote[] {
    return [...this.recorded.values()];
  }

  /**
   * Answers the next call with `answer` instead of the normal behaviour; a success scripted this
   * way records the vote. Answers are used in the order they are queued.
   */
  answerNext(answer: Result<void, VoteSubmissionError>): void {
    this.scripted.push(answer);
  }

  submit(vote: Vote): Promise<Result<void, VoteSubmissionError>> {
    this.received.push(vote);
    this.onReceive?.(vote);
    const answer = this.scripted.shift() ?? this.defaultAnswer(vote);
    if (answer.ok) this.recorded.set(vote.idempotencyKey, vote);
    return Promise.resolve(answer);
  }

  private defaultAnswer(vote: Vote): Result<void, VoteSubmissionError> {
    if (!this.network.online) return err(networkUnavailable());
    if (this.auth.session?.user.id !== vote.voterId) return err(unauthorized());
    const held = this.recorded.get(vote.idempotencyKey);
    if (held !== undefined && held.choice !== vote.choice) {
      return err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded });
    }
    return ok(undefined);
  }
}
