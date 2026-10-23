import type { Clock } from '@core/application/ports/Clock';
import { forbidden, notFound, unauthorized, unexpected } from '@core/domain/errors/RepositoryError';
import type {
  ForbiddenError,
  NetworkUnavailableError,
  NotFoundError,
  UnauthorizedError,
  UnexpectedError,
} from '@core/domain/errors/RepositoryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@core/domain/errors/VotingError';
import type { VotingError } from '@core/domain/errors/VotingError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import { createPage } from '@core/domain/value-objects/Page';
import type { Page } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import type { PageCursor } from '@core/domain/value-objects/PageCursor';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import type { PageRequest } from '@core/domain/value-objects/PageRequest';
import type { DocumentId, MeetingId, ResolutionId, UserId } from '@core/domain/value-objects/ids';
import { clonePlain } from '@core/infrastructure/shared/clonePlain';
import type { AuthSession } from '@features/auth/application/ports/AuthSession';
import { isSessionExpired } from '@features/auth/domain/policies/sessionExpiry';
import type { Document } from '@features/meetings/domain/entities/Document';
import { findParticipant } from '@features/meetings/domain/entities/Meeting';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { createVote, idempotencyKeyOf } from '@features/votes/domain/entities/Vote';
import type { IdempotencyKey, Vote } from '@features/votes/domain/entities/Vote';
import { checkVotingEligibility } from '@features/votes/domain/policies/votingEligibility';

import { createDocumentPdf } from '../pdf/createDocumentPdf';

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

/**
 * Where the server learns who is calling: a session, as a real server would learn it from the token
 * a request carries. A session whose expiry has passed is refused.
 */
export type Caller = Pick<AuthSession, 'current'>;

export interface InMemoryBackendOptions {
  readonly clock: Clock;
  /**
   * The caller of the requests that do not name one: the session stored on the device, which is
   * how the in-memory repositories reach the server. The HTTP API names the caller of each request
   * (see `MockApi`).
   */
  readonly auth: Caller;
  /** The connectivity of the server. Exposed as `network`. */
  readonly network: SimulatedNetwork;
  readonly content: ServerContent;
}

/** Separates the instant and the id in a page cursor. */
const CURSOR_SEPARATOR = ':';

/** The `cause` of the `unexpected` errors. Technical, and free of any value of the query. */
const FAILURE_CAUSE = {
  InvalidCursor: 'invalid page cursor',
  InvalidLimit: 'invalid page limit',
  CursorNotBuilt: 'page cursor could not be built',
} as const;

/**
 * What the server sends for the content of a document: the file, who it was made for and which
 * version of the document it is. The HTTP API sends the same three things (the body, the token's
 * user, which the client knows, and the `ETag`).
 */
export interface ServedDocumentContent {
  /** The user the content was served to. Two users never share a download. */
  readonly userId: UserId;
  /**
   * Identifies the version of the content. It changes when the content or the classification of the
   * document does, so a download is never reused across versions. Opaque.
   */
  readonly version: string;
  /** The bytes of the PDF. */
  readonly bytes: Uint8Array<ArrayBuffer>;
}

/** Why a content cannot be held by the server. */
export const SERVER_CONTENT_ERROR_CODE = {
  DuplicateResolutionId: 'duplicateResolutionId',
} as const;

/**
 * Two meetings of the content have a resolution with the same id. Resolution ids are globally
 * unique (see `ResolutionId`): the idempotency key of a vote holds the resolution and the voter,
 * not the meeting, so a shared id would make a vote on one meeting look like a vote on the other.
 */
export interface ServerContentError {
  readonly code: typeof SERVER_CONTENT_ERROR_CODE.DuplicateResolutionId;
  readonly resolutionId: ResolutionId;
}

function duplicateResolutionId(resolutionId: ResolutionId): ServerContentError {
  return { code: SERVER_CONTENT_ERROR_CODE.DuplicateResolutionId, resolutionId };
}

/** A resolution id that two meetings share, or `undefined`. (Within a meeting the domain checks it.) */
function findDuplicateResolutionId(meetings: readonly Meeting[]): ResolutionId | undefined {
  const seen = new Set<ResolutionId>();
  for (const meeting of meetings) {
    for (const item of meeting.agenda) {
      if (item.resolution === undefined) continue;
      if (seen.has(item.resolution.id)) return item.resolution.id;
      seen.add(item.resolution.id);
    }
  }
  return undefined;
}

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
 *   document that exists but that the user may not have is refused with `forbidden`, and one that
 *   does not exist is `notFound`. Telling them apart reveals that an id exists. That is little here
 *   (ids are opaque, issued by the server, and a board is a closed group), and it lets the client
 *   say "you no longer have access" instead of "does not exist"; a server that wants to hide the
 *   existence answers `notFound`, which the application treats the same way;
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
  /** Counts the versions of the content: a download is never reused across two of them. */
  private revision = 0;

  private constructor(private readonly options: InMemoryBackendOptions) {
    this.network = options.network;
  }

  /**
   * A server holding the content, or the reason the content is not acceptable: two meetings must
   * not share a resolution id (see `ResolutionId`).
   */
  static create(options: InMemoryBackendOptions): Result<InMemoryBackend, ServerContentError> {
    const backend = new InMemoryBackend(options);
    const loaded = backend.replaceContent(options.content);
    return isErr(loaded) ? loaded : ok(backend);
  }

  /**
   * Replaces everything the server holds, for a test that sets the world up. The content is
   * refused, and the server keeps what it held, when two meetings share a resolution id.
   */
  replaceContent(content: ServerContent): Result<void, ServerContentError> {
    const duplicate = findDuplicateResolutionId(content.meetings);
    if (duplicate !== undefined) return err(duplicateResolutionId(duplicate));

    this.revision += 1;
    this.meetings = new Map(
      content.meetings.map((meeting) => [meeting.id, clonePlain(meeting)] as const),
    );
    this.votes = new Map(
      content.recordedVotes.map((vote) => [vote.idempotencyKey, clonePlain(vote)] as const),
    );
    return ok(undefined);
  }

  /** The votes the server holds, whoever cast them. For tests, not for a client. */
  recordedVotes(): readonly Vote[] {
    return clonePlain([...this.votes.values()]);
  }

  listMeetings(
    period: MeetingPeriod,
    request: PageRequest,
    caller: Caller = this.options.auth,
  ): Promise<
    Result<Page<MeetingSummary>, NetworkUnavailableError | UnauthorizedError | UnexpectedError>
  > {
    return this.serve(caller, (userId) => this.pageOf(userId, period, request));
  }

  getMeeting(
    id: MeetingId,
    caller: Caller = this.options.auth,
  ): Promise<
    Result<Meeting, NetworkUnavailableError | UnauthorizedError | NotFoundError | ForbiddenError>
  > {
    return this.serve<Meeting, NotFoundError | ForbiddenError>(caller, (userId) => {
      const meeting = this.meetings.get(id);
      if (meeting === undefined) return err(notFound());
      if (findParticipant(meeting, userId) === undefined) return err(forbidden());
      return ok(this.viewFor(meeting, userId));
    });
  }

  getDocument(
    id: DocumentId,
    caller: Caller = this.options.auth,
  ): Promise<
    Result<Document, NetworkUnavailableError | UnauthorizedError | NotFoundError | ForbiddenError>
  > {
    return this.serve<Document, NotFoundError | ForbiddenError>(caller, (userId) => {
      const found = this.findDocument(id, userId);
      if (found === undefined) return err(notFound());
      return found.allowed ? ok(clonePlain(found.document)) : err(forbidden());
    });
  }

  /**
   * The content of a document: a PDF with one page for each page of the document (up to a maximum,
   * see `createDocumentPdf`), the user it was served to and the version of the content. The
   * version is per revision of what the server holds: a download is never reused across two of
   * them.
   */
  fetchDocumentContent(
    id: DocumentId,
    caller: Caller = this.options.auth,
  ): Promise<
    Result<
      ServedDocumentContent,
      NetworkUnavailableError | UnauthorizedError | NotFoundError | ForbiddenError
    >
  > {
    return this.serve<ServedDocumentContent, NotFoundError | ForbiddenError>(caller, (userId) => {
      const found = this.findDocument(id, userId);
      if (found === undefined) return err(notFound());
      if (!found.allowed) return err(forbidden());
      return ok({
        userId,
        version: String(this.revision),
        bytes: createDocumentPdf(found.document),
      });
    });
  }

  submitVote(
    vote: Vote,
    caller: Caller = this.options.auth,
  ): Promise<Result<void, NetworkUnavailableError | UnauthorizedError | VotingError>> {
    return this.serve(caller, (userId) => this.record(vote, userId));
  }

  /**
   * The request pipeline. The identity is read when the request is created, from the session of
   * the caller at that moment, like a client that attaches its token before sending: nobody signed
   * in is `unauthorized`, whatever the network. Then the request goes through the network, and the
   * handler answers for the identity of the request, never for a user who signed in while it was
   * on its way.
   */
  private async serve<T, E>(
    caller: Caller,
    handle: (userId: UserId) => Result<T, E>,
  ): Promise<Result<T, E | NetworkUnavailableError | UnauthorizedError>> {
    const userId = await this.authenticatedUser(caller);
    if (userId === undefined) return err(unauthorized());

    const reached = await this.network.enter();
    if (isErr(reached)) return reached;
    return handle(userId);
  }

  private async authenticatedUser(caller: Caller): Promise<UserId | undefined> {
    const current = await caller.current();
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
    // The limit comes from outside: it is checked by the rules of the domain, not trusted.
    const valid = createPageRequest({
      limit: request.limit,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
    });
    if (isErr(valid)) return err(unexpected(FAILURE_CAUSE.InvalidLimit));
    const { limit } = valid.value;

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

    const items = ordered.slice(start, start + limit).map(summaryOf);
    const last = items.at(-1);
    if (last === undefined || start + limit >= ordered.length) {
      return ok(createPage(items));
    }
    const nextCursor = parsePageCursor(encodeCursor(last));
    return nextCursor.ok
      ? ok(createPage(items, nextCursor.value))
      : err(unexpected(FAILURE_CAUSE.CursorNotBuilt));
  }

  /**
   * The document, and whether the user may have it: they may when they take part in a meeting that
   * lists it. `undefined` when no meeting lists it at all.
   */
  private findDocument(
    id: DocumentId,
    userId: UserId,
  ): { readonly document: Document; readonly allowed: boolean } | undefined {
    let found: Document | undefined;
    for (const meeting of this.meetings.values()) {
      const document = meeting.documents.find((candidate) => candidate.id === id);
      if (document === undefined) continue;
      if (findParticipant(meeting, userId) !== undefined) return { document, allowed: true };
      found ??= document;
    }
    return found === undefined ? undefined : { document: found, allowed: false };
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

    // A key that already holds a vote answers before any rule of eligibility: the same choice is
    // the same vote sent again (success, even if the resolution has closed since), another choice
    // is a second vote (`alreadyVoted`, not `resolutionClosed`). The meeting is compared too, as
    // a safeguard: resolution ids are unique, so a vote held under the key of another meeting
    // cannot happen.
    const key = idempotencyKeyOf(vote.resolutionId, userId);
    const held = this.votes.get(key);
    if (held !== undefined && held.meetingId === vote.meetingId) {
      return held.choice === vote.choice
        ? ok(undefined)
        : err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded });
    }

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

/** `<instant>:<encoded id>`. The id is encoded, so the separator cannot appear inside it. */
function encodeCursor({ scheduledAt, id }: CursorKey): string {
  return `${scheduledAt}${CURSOR_SEPARATOR}${encodeURIComponent(id)}`;
}

/** Exactly what `encodeCursor` writes: a whole instant without sign, sign or leading zero, a separator, an encoded id. */
const CURSOR_FORMAT = /^(0|[1-9][0-9]*):([^:]+)$/;

function decodeCursor(cursor: PageCursor): CursorKey | undefined {
  const match = CURSOR_FORMAT.exec(cursor);
  const [, instant, encodedId] = match ?? [];
  if (instant === undefined || encodedId === undefined) return undefined;
  const scheduledAt = Number(instant);
  if (!Number.isSafeInteger(scheduledAt)) return undefined;
  try {
    return { scheduledAt, id: decodeURIComponent(encodedId) };
  } catch {
    // A malformed escape sequence: a cursor this server did not write.
    return undefined;
  }
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
