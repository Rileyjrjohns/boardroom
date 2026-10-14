import type { Vote } from '@domain/entities/Vote';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Monitoring } from '@application/ports/Monitoring';
import type { VoteRepository, VoteSubmissionError } from '@application/ports/VoteRepository';

import { toVoteRequestWire } from './dto/voteDto';
import { asGatewayError } from './gatewayErrors';
import { HTTP_FAILURE_CODE } from './HttpClient';
import type { HttpClient } from './HttpClient';
import { domainViolation, HTTP_RESOURCE, schemaViolation } from './invalidResponse';
import { issuePathsOf } from '../shared/issuePaths';
import { HTTP_HEADER, HTTP_METHOD, ROUTES } from './protocol';
import { toVotingError, votingErrorSchema } from '../shared/rejectionSchemas';

/**
 * The votes of the API (`POST /votes`). The request carries the idempotency key in a header, so
 * that a retry after a lost answer is recorded once; the key is percent-encoded, because the ids
 * it is made of are free text. A vote the server refuses by a business rule (422) is a voting
 * error, and sending it again changes nothing.
 *
 * The request is made for the voter (`forUser`): the client sends it only with the token of that
 * user, and answers `unauthorized`, without sending, if somebody else is signed in by then. So a
 * vote is never recorded under the session of another user, whatever the server checks. The body
 * of a success carries nothing the app needs and is not read: a success is a success, whatever it
 * says.
 */
export class HttpVoteRepository implements VoteRepository {
  constructor(
    private readonly client: HttpClient,
    private readonly monitoring: Monitoring,
  ) {}

  async submit(vote: Vote): Promise<Result<void, VoteSubmissionError>> {
    const answer = await this.client.perform(() => ({
      method: HTTP_METHOD.Post,
      path: ROUTES.votes,
      headers: { [HTTP_HEADER.IdempotencyKey]: encodeURIComponent(vote.idempotencyKey) },
      body: toVoteRequestWire(vote),
      forUser: vote.voterId,
      resource: HTTP_RESOURCE.Vote,
    }));
    if (answer.ok) return ok(undefined);
    if (answer.error.code !== HTTP_FAILURE_CODE.RequestRejected) {
      return err(asGatewayError(answer.error));
    }

    const described = votingErrorSchema.safeParse(answer.error.error);
    if (!described.success) {
      return err(
        schemaViolation(this.monitoring, HTTP_RESOURCE.Vote, issuePathsOf(described.error)),
      );
    }
    const rejection = toVotingError(described.data);
    return rejection.ok
      ? err(rejection.value)
      : err(domainViolation(this.monitoring, HTTP_RESOURCE.Vote, rejection.error));
  }
}
