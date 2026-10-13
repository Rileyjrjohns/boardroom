import type { Vote } from '@domain/entities/Vote';
import type { GatewayError } from '@domain/errors/RepositoryError';
import type { VotingError } from '@domain/errors/VotingError';
import type { Result } from '@domain/shared/Result';

/**
 * Why a vote was not recorded. A `VotingError` is a business rejection: the server understood the
 * vote and refused it (resolution closed, already voted, not eligible), so sending it again
 * changes nothing. A `GatewayError` is a failure of the exchange itself.
 */
export type VoteSubmissionError = GatewayError | VotingError;

/** The remote source that records votes. */
export interface VoteRepository {
  /**
   * Sends a vote.
   *
   * Contract:
   * - Never throws or rejects. It settles in bounded time; a request that times out is
   *   `networkUnavailable`.
   * - Idempotent on `vote.idempotencyKey`: sending a vote the server already holds under that key
   *   (a retry after the answer was lost) succeeds without recording it twice. It never answers
   *   `alreadyVoted` to the very vote it recorded. A different choice under the same key is a
   *   second vote, and is rejected as `alreadyVoted`.
   * - If the voter of the vote is not the user the request is authenticated as, the adapter answers
   *   `unauthorized`, never a voting error: a vote is only ever recorded for the signed-in user,
   *   whoever queued it.
   * - The server must not trust `castAt`. It comes from the clock of the device, which the user
   *   controls: the server stamps the vote with its own time and applies the voting window to it.
   * - `networkUnavailable` and `unexpected` say nothing about the vote (the server may or may not
   *   have recorded it), so the vote is kept and sent again later; the key makes the replay safe.
   *   `unauthorized` stops everything until the user signs in again. A voting error is final.
   */
  submit(vote: Vote): Promise<Result<void, VoteSubmissionError>>;
}
