import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { GatewayError, RepositoryError } from '@domain/errors/RepositoryError';
import type { MeetingId } from '@domain/value-objects/ids';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { Page } from '@domain/value-objects/Page';
import type { PageRequest } from '@domain/value-objects/PageRequest';
import type { Result } from '@domain/shared/Result';

/**
 * The remote source of truth for meetings. Read only.
 *
 * Contract: no method throws or rejects, and every method settles in bounded time. Every failure
 * is an error `Result`: `networkUnavailable` when the server cannot be reached (a request that
 * times out included), `unauthorized` when the caller is refused, `notFound` when an item does not
 * exist, `unexpected` for anything else. The free-text `cause` of `unexpected` must never hold
 * personal data nor the values of a query.
 */
export interface MeetingRepository {
  /** One page of the meetings of a period: upcoming ones soonest first, past ones latest first. */
  list(
    period: MeetingPeriod,
    request: PageRequest,
  ): Promise<Result<Page<MeetingSummary>, GatewayError>>;

  /** A meeting with its agenda, documents and participants. */
  get(id: MeetingId): Promise<Result<Meeting, RepositoryError>>;
}
