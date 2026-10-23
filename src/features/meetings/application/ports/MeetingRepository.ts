import type { GatewayError, RepositoryError } from '@core/domain/errors/RepositoryError';
import type { Result } from '@core/domain/shared/Result';
import type { Page } from '@core/domain/value-objects/Page';
import type { PageRequest } from '@core/domain/value-objects/PageRequest';
import type { MeetingId } from '@core/domain/value-objects/ids';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

/**
 * The remote source of truth for meetings. Read only.
 *
 * Contract: no method throws or rejects, and every method settles in bounded time. Every failure
 * is an error `Result`:
 *
 * - `networkUnavailable` when the server cannot be reached (a request that times out included);
 * - `unauthorized` when the SESSION is no longer valid (expired, revoked, signed out elsewhere):
 *   it concerns everything the caller holds, and the application empties both caches;
 * - `forbidden` when the session is valid but this user may not see THIS item (removed from the
 *   meeting): it concerns one item, and the application drops it, and what hangs off it, from the
 *   caches. A server that prefers not to reveal that an item exists answers `notFound` instead,
 *   which the application treats the same way;
 * - `notFound` when an item does not exist;
 * - `unexpected` for anything else. Its free-text `cause` is a status code or a kind of failure:
 *   never a path, a URL, the location of a document or its title, a name, an email, an id taken
 *   from a query, nor a vote choice.
 *
 * A request carries the identity that was read when it was created (the token of the user who was
 * signed in then): a request in flight is answered for that user, never for one who signed in
 * while it was on its way. The application checks again, when the answer arrives, that the same
 * user is still signed in.
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
