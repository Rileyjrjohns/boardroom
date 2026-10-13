import type { Document } from '@domain/entities/Document';
import { findParticipant } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { Resolution } from '@domain/entities/Resolution';
import { createVote, idempotencyKeyOf } from '@domain/entities/Vote';
import type { IdempotencyKey, Vote } from '@domain/entities/Vote';
import { notFound, unauthorized, unexpected } from '@domain/errors/RepositoryError';
import type {
  NetworkUnavailableError,
  NotFoundError,
  UnauthorizedError,
  UnexpectedError,
} from '@domain/errors/RepositoryError';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { VotingError } from '@domain/errors/VotingError';
import { isSessionExpired } from '@domain/policies/sessionExpiry';
import { checkVotingEligibility } from '@domain/policies/votingEligibility';
import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseDocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, MeetingId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { createPage } from '@domain/value-objects/Page';
import type { Page } from '@domain/value-objects/Page';
import { parsePageCursor } from '@domain/value-objects/PageCursor';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import type { PageRequest } from '@domain/value-objects/PageRequest';
import type { AuthSession } from '@application/ports/AuthSession';
import type { Clock } from '@application/ports/Clock';

import { clonePlain } from '../shared/clonePlain';

import type { SimulatedNetwork } from './SimulatedNetwork';

/**
 * What the simulated server holds. Server data, not user interface text: it is in English whatever
 * the language of the app.
 */
export interface ServerContent {
  /**
   * The meetings with their agenda, documents and participants. A resolution carries no
   * `recordedVote` here: a recorded vote belongs to its voter, so it is listed in `recordedVotes`
   * and added to the resolution of the user who asks.
   */
  readonly meetings: readonly Meeting[];
  /** The votes already recorded, whoever cast them. */
  readonly recordedVotes: readonly Vote[];
}

export interface InMemoryBackendOptions {
  readonly clock: Clock;
  /**
   * Where the server learns who is calling: the session stored on the device, as a real server
   * would learn it from the token the device sends. A session whose expiry has passed is refused.
   */
  readonly auth: Pick<AuthSession, 'current'>;
  /** The connectivity of the server. Exposed as `network`. */
  readonly network: SimulatedNetwork;
  readonly content: ServerContent;
}

/** Where the content of a document is, once downloaded. A scheme no real storage uses. */
const DOCUMENT_LOCATION_PREFIX = 'memory://documents/';

/** Separates the instant and the id in a page cursor. The instant has no separator in it. */
const CURSOR_SEPARATOR = ':';

/** The `cause` of the `unexpected` errors. Technical, and free of any value of the query. */
const FAILURE_CAUSE = {
  InvalidCursor: 'invalid page cursor',
  CursorNotBuilt: 'page cursor could not be built',
  LocationNotBuilt: 'document location could not be built',
} as const;

interface CursorKey {
  readonly scheduledAt: number;
  readonly id: string;
}

/**
 * The simulated server behind the three remote repositories: one state, shared by all of them, so
 * that a vote recorded through one is seen by the others. It behaves the way the port contracts
 * describe a real one:
 *
 * - every request enters the network first (`networkUnavailable` offline, then the latency), then
 *   is authenticated (`unauthorized` without a valid session);
 * - a user sees the meetings they take part in. Which of the two lists a meeting is in is decided
 *   here, against the clock: upcoming ones soonest first, past ones latest first. A meeting or a
 *   document the user cannot see does not exist for them (`notFound`);
 * - pages are cut to the requested limit and continue after an opaque cursor that stays valid when
 *   the lists change in between;
 * - a vote is recorded for the authenticated user only, once per resolution: sending the same vote
 *   again succeeds, another choice is `alreadyVoted`. The business rules are the ones of the
 *   domain (`checkVotingEligibility`), applied at the time of the server, which stamps the vote
 *   with its own time and never trusts `castAt`.
 *
 * Everything it returns is a copy, so no client holds a reference into the server state.
 */
export class InMemoryBackend {
  readonly network: SimulatedNetwork;
  private meetings = new Map<MeetingId, Meeting>();
  private votes = new Map<IdempotencyKey, Vote>();

  constructor(private readonly options: InMemoryBackendOptions) {
    this.network = options.network;
    this.replaceContent(options.content);
  }

  /** Replaces everything the server holds: the demo's reset, and the set-up of a test. */
  replaceContent(content: ServerContent): void {
    this.meetings = new Map(
      content.meetings.map((meeting) => [meeting.id, clonePlain(meeting)] as const),
    );
    this.votes = new Map(
      content.recordedVotes.map((vote) => [vote.idempotencyKey, clonePlain(vote)] as const),
    );
  }

  /** The votes the server holds, whoever cast them. For tests and the demo, not for a client. */
  recordedVotes(): readonly Vote[] {
    return clonePlain([...this.votes.values()]);
  }

  listMeetings(
    period: MeetingPeriod,
    request: PageRequest,
  ): Promise<
    Result<Page<MeetingSummary>, NetworkUnavailableError | UnauthorizedError | UnexpectedError>
  > {
    return this.serve((userId) => this.pageOf(userId, period, request));
  }

  getMeeting(
    id: MeetingId,
  ): Promise<Result<Meeting, NetworkUnavailableError | UnauthorizedError | NotFoundError>> {
    return this.serve((userId) => {
      const meeting = this.meetings.get(id);
      if (meeting === undefined || findParticipant(meeting, userId) === undefined) {
        return err(notFound());
      }
      return ok(this.viewFor(meeting, userId));
    });
  }

  getDocument(
    id: DocumentId,
  ): Promise<Result<Document, NetworkUnavailableError | UnauthorizedError | NotFoundError>> {
    return this.serve((userId) => {
      const document = this.findVisibleDocument(id, userId);
      return document === undefined ? err(notFound()) : ok(clonePlain(document));
    });
  }

  /** Where the content of a document can be read once downloaded. The download itself is not simulated. */
  fetchDocumentContent(
    id: DocumentId,
  ): Promise<
    Result<
      DocumentLocation,
      NetworkUnavailableError | UnauthorizedError | NotFoundError | UnexpectedError
    >
  > {
    return this.serve<DocumentLocation, NotFoundError | UnexpectedError>((userId) => {
      if (this.findVisibleDocument(id, userId) === undefined) return err(notFound());
      const location = parseDocumentLocation(`${DOCUMENT_LOCATION_PREFIX}${id}`);
      return location.ok ? location : err(unexpected(FAILURE_CAUSE.LocationNotBuilt));
    });
  }

  submitVote(
    vote: Vote,
  ): Promise<Result<void, NetworkUnavailableError | UnauthorizedError | VotingError>> {
    return this.serve((userId) => this.record(vote, userId));
  }

  /** The request pipeline: network, then authentication, then the handler. */
  private async serve<T, E>(
    handle: (userId: UserId) => Result<T, E>,
  ): Promise<Result<T, E | NetworkUnavailableError | UnauthorizedError>> {
    const reached = await this.network.enter();
    if (isErr(reached)) return reached;

    const userId = await this.authenticatedUser();
    if (userId === undefined) return err(unauthorized());
    return handle(userId);
  }

  private async authenticatedUser(): Promise<UserId | undefined> {
    const current = await this.options.auth.current();
    if (isErr(current) || current.value === undefined) return undefined;
    return isSessionExpired(current.value, this.options.clock.now())
      ? undefined
      : current.value.user.id;
  }

  private pageOf(
    userId: UserId,
    period: MeetingPeriod,
    request: PageRequest,
  ): Result<Page<MeetingSummary>, UnexpectedError> {
    const now = this.options.clock.now();
    const ordered = [...this.meetings.values()]
      .filter(
        (meeting) =>
          findParticipant(meeting, userId) !== undefined && periodOf(meeting, now) === period,
      )
      .sort(comparatorOf(period));

    let start = 0;
    if (request.cursor !== undefined) {
      const after = decodeCursor(request.cursor);
      if (after === undefined) return err(unexpected(FAILURE_CAUSE.InvalidCursor));
      const compare = comparatorOf(period);
      const firstAfter = ordered.findIndex((meeting) => compare(meeting, after) > 0);
      start = firstAfter === -1 ? ordered.length : firstAfter;
    }

    const items = ordered.slice(start, start + request.limit).map(summaryOf);
    const last = items.at(-1);
    if (last === undefined || start + request.limit >= ordered.length) {
      return ok(createPage(items));
    }
    const nextCursor = parsePageCursor(`${last.scheduledAt}${CURSOR_SEPARATOR}${last.id}`);
    return nextCursor.ok
      ? ok(createPage(items, nextCursor.value))
      : err(unexpected(FAILURE_CAUSE.CursorNotBuilt));
  }

  private findVisibleDocument(id: DocumentId, userId: UserId): Document | undefined {
    for (const meeting of this.meetings.values()) {
      if (findParticipant(meeting, userId) === undefined) continue;
      const document = meeting.documents.find((candidate) => candidate.id === id);
      if (document !== undefined) return document;
    }
    return undefined;
  }

  /** The meeting as the user sees it: their own recorded votes on the resolutions. */
  private viewFor(meeting: Meeting, userId: UserId): Meeting {
    return clonePlain({
      ...meeting,
      agenda: meeting.agenda.map((item) =>
        item.resolution === undefined
          ? item
          : { ...item, resolution: this.withRecordedVote(item.resolution, userId) },
      ),
    });
  }

  private withRecordedVote(resolution: Resolution, userId: UserId): Resolution {
    const held = this.votes.get(idempotencyKeyOf(resolution.id, userId));
    return held === undefined ? resolution : { ...resolution, recordedVote: held.choice };
  }

  private record(vote: Vote, userId: UserId): Result<void, UnauthorizedError | VotingError> {
    // A vote is recorded for the user the request is authenticated as, whoever queued it.
    if (vote.voterId !== userId) return err(unauthorized());

    const key = idempotencyKeyOf(vote.resolutionId, userId);
    if (this.votes.get(key)?.choice === vote.choice) return ok(undefined);

    const meeting = this.meetings.get(vote.meetingId);
    if (meeting === undefined) {
      return err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: vote.resolutionId });
    }

    const now = this.options.clock.now();
    const eligible = checkVotingEligibility({
      meeting: this.viewFor(meeting, userId),
      resolutionId: vote.resolutionId,
      voterId: userId,
      queuedVotes: [],
      now,
    });
    if (isErr(eligible)) return eligible;

    // The server's time, not the `castAt` of a device whose clock the user controls.
    this.votes.set(
      key,
      createVote({
        resolutionId: vote.resolutionId,
        meetingId: vote.meetingId,
        voterId: userId,
        choice: vote.choice,
        castAt: now,
      }),
    );
    return ok(undefined);
  }
}

function periodOf(meeting: MeetingSummary, now: Instant): MeetingPeriod {
  return meeting.scheduledAt > now ? MEETING_PERIOD.Upcoming : MEETING_PERIOD.Past;
}

function compareIds(first: string, second: string): number {
  if (first === second) return 0;
  return first < second ? -1 : 1;
}

/** Upcoming meetings soonest first, past ones latest first, ties broken by id. */
function comparatorOf(period: MeetingPeriod): (first: CursorKey, second: CursorKey) => number {
  return (first, second) => {
    const byTime =
      period === MEETING_PERIOD.Upcoming
        ? first.scheduledAt - second.scheduledAt
        : second.scheduledAt - first.scheduledAt;
    return byTime !== 0 ? byTime : compareIds(first.id, second.id);
  };
}

function decodeCursor(cursor: PageCursor): CursorKey | undefined {
  const separatorAt = cursor.indexOf(CURSOR_SEPARATOR);
  if (separatorAt <= 0) return undefined;
  const scheduledAt = Number(cursor.slice(0, separatorAt));
  return Number.isInteger(scheduledAt)
    ? { scheduledAt, id: cursor.slice(separatorAt + CURSOR_SEPARATOR.length) }
    : undefined;
}

/** What a list shows: not the agenda, the documents nor the participants. */
function summaryOf(meeting: MeetingSummary): MeetingSummary {
  return {
    id: meeting.id,
    title: meeting.title,
    scheduledAt: meeting.scheduledAt,
    location: meeting.location,
  };
}
