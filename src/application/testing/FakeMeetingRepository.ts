import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import { forbidden, networkUnavailable, notFound } from '@domain/errors/RepositoryError';
import type { GatewayError, RepositoryError } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { unwrap } from '@domain/testing/builders';
import type { MeetingId } from '@domain/value-objects/ids';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { createPage } from '@domain/value-objects/Page';
import type { Page } from '@domain/value-objects/Page';
import { parsePageCursor } from '@domain/value-objects/PageCursor';
import type { PageRequest } from '@domain/value-objects/PageRequest';

import type { MeetingRepository } from '../ports/MeetingRepository';

import { copyPlain } from './copyPlain';
import type { FakeNetwork } from './FakeNetwork';

/**
 * The remote meetings of a test. It behaves like the server the port describes: a list is sorted
 * as documented (upcoming meetings soonest first, past ones latest first), cut to the page size of
 * the request, and continued from the cursor, which here is the id of the last meeting of the
 * previous page. A wrong request (another period, another size, another cursor) is therefore
 * visible in what comes back, not only in the calls recorded. A cursor that matches nothing gives
 * an empty page.
 */
export class FakeMeetingRepository implements MeetingRepository {
  /** Makes every call fail with this error while set (an `unauthorized` server, say). */
  failure: GatewayError | undefined;

  /**
   * Called when a request arrives, before the server answers: a test uses it to change the world
   * while the request is in flight (another user signs in, say). The answer is the one of the
   * world after the hook has run.
   */
  onRequest: (() => void | Promise<void>) | undefined;

  readonly listCalls: { period: MeetingPeriod; request: PageRequest }[] = [];
  readonly getCalls: MeetingId[] = [];

  private readonly summaries = new Map<MeetingPeriod, readonly MeetingSummary[]>();
  private readonly meetings = new Map<MeetingId, Meeting>();
  private readonly forbiddenIds = new Set<MeetingId>();

  constructor(private readonly network: FakeNetwork) {}

  /** The meetings of a period, in any order. */
  setMeetings(period: MeetingPeriod, summaries: readonly MeetingSummary[]): void {
    this.summaries.set(period, summaries);
  }

  addMeeting(meeting: Meeting): void {
    this.meetings.set(meeting.id, meeting);
  }

  /** The server no longer has the meeting. */
  removeMeeting(id: MeetingId): void {
    this.meetings.delete(id);
    this.forbiddenIds.delete(id);
  }

  /** The server has the meeting but refuses the caller: it answers `forbidden`. */
  forbid(id: MeetingId): void {
    this.forbiddenIds.add(id);
  }

  async list(
    period: MeetingPeriod,
    request: PageRequest,
  ): Promise<Result<Page<MeetingSummary>, GatewayError>> {
    this.listCalls.push({ period, request });
    await this.onRequest?.();
    if (!this.network.online) return err(networkUnavailable());
    if (this.failure !== undefined) return err(this.failure);

    const sorted = [...(this.summaries.get(period) ?? [])].sort((first, second) =>
      period === MEETING_PERIOD.Upcoming
        ? first.scheduledAt - second.scheduledAt
        : second.scheduledAt - first.scheduledAt,
    );
    const after: string | undefined = request.cursor;
    const afterIndex = sorted.findIndex(({ id }) => id === after);
    // No cursor: from the start. A cursor that matches nothing: past the end.
    const start = after === undefined ? 0 : afterIndex === -1 ? sorted.length : afterIndex + 1;
    const items = sorted.slice(start, start + request.limit);
    const last = items.at(-1);
    const hasMore = start + request.limit < sorted.length;

    return ok(
      copyPlain(
        hasMore && last !== undefined
          ? createPage(items, unwrap(parsePageCursor(last.id)))
          : createPage(items),
      ),
    );
  }

  async get(id: MeetingId): Promise<Result<Meeting, RepositoryError>> {
    this.getCalls.push(id);
    await this.onRequest?.();
    if (!this.network.online) return err(networkUnavailable());
    if (this.failure !== undefined) return err(this.failure);
    if (this.forbiddenIds.has(id)) return err(forbidden());
    const meeting = this.meetings.get(id);
    return meeting === undefined ? err(notFound()) : ok(copyPlain(meeting));
  }
}
