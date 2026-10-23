import type { z } from 'zod';

import type { ValidationError } from '@core/domain/errors/ValidationError';
import { err, map, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { ResolutionId } from '@core/domain/value-objects/ids';
import { issuePathsOf } from '@core/infrastructure/shared/issuePaths';
import type { User } from '@features/auth/domain/entities/User';
import { toUser } from '@features/auth/infrastructure/dto/sessionDto';
import { findParticipant } from '@features/meetings/domain/entities/Meeting';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import { toMeeting } from '@features/meetings/infrastructure/dto/meetingDto';
import type { meetingSchema } from '@features/meetings/infrastructure/dto/meetingDto';
import type { Vote } from '@features/votes/domain/entities/Vote';
import { toVote } from '@features/votes/infrastructure/dto/voteDto';

import type { DemoAccount } from '../InMemoryAuthSession';
import type { ServerContent } from '../InMemoryBackend';

import { accountsFileSchema, meetingsFileSchema, recordedVotesFileSchema } from './fixtureSchemas';

// Reads the fixtures of docs/spec/fixtures into the content of the simulated server. The files are
// data from outside the code: they are checked, then turned into domain objects through the
// factories of the domain, and a flaw is a `FixtureError`, never an exception.
//
// Every date of the files is relative to their `referenceDate`. Loading shifts all of them by the
// same amount, a whole number of days: `floor((now - referenceDate) / one day)` days. The timeline
// keeps its shape and the meetings keep their time of day (09:00 stays 09:00, in UTC), whatever the
// day the app starts. A whole number of days is less than a day short of the exact
// `now - referenceDate`, so the files must keep a margin of a day around the reference date, which
// loading checks: that is what keeps an upcoming meeting upcoming and a past one past.

const MILLIS_PER_DAY = 86_400_000;

/**
 * The room the files leave around the reference date: every meeting and every closing time is at
 * least this far from it, on either side, and no vote was cast after it. The whole-day shift falls
 * short of the exact `now - referenceDate` by less than this, so with this margin no instant of the
 * files can cross `now`.
 */
const TIMELINE_MARGIN_MILLIS = MILLIS_PER_DAY;

/** The files of the fixtures. */
export const FIXTURE_FILE = {
  Accounts: 'accounts.json',
  Meetings: 'meetings.json',
  RecordedVotes: 'recorded-votes.json',
} as const;

export type FixtureFile = (typeof FIXTURE_FILE)[keyof typeof FIXTURE_FILE];

/** The content of the files, as parsed from JSON and not yet checked. */
export interface FixtureFiles {
  readonly accounts: unknown;
  readonly meetings: unknown;
  readonly recordedVotes: unknown;
}

/** Why a fixture cannot be loaded. */
export const FIXTURE_ERROR_CODE = {
  /** A field is missing, or has the wrong type. */
  InvalidShape: 'invalidShape',
  /** A value breaks a rule of the domain (a blank title, an unknown status, an instant out of range). */
  InvalidValue: 'invalidValue',
  /** The files do not share the same `referenceDate`: they are not from the same generation. */
  ReferenceDateMismatch: 'referenceDateMismatch',
  /** An id points to something that is not in the files. */
  UnknownReference: 'unknownReference',
  /** Two members that must be unique share an identity. */
  Duplicate: 'duplicate',
  /**
   * A meeting or a closing time is less than a day from the reference date, or a vote was cast after
   * it: shifted by whole days, it could fall on the other side of the clock.
   */
  TimelineMargin: 'timelineMargin',
} as const;

/**
 * Where and why a fixture was refused. `detail` names the file and the place in it (`meetings.2.title`),
 * never a value: the same convention as for the answers of the API.
 */
export interface FixtureError {
  readonly code: (typeof FIXTURE_ERROR_CODE)[keyof typeof FIXTURE_ERROR_CODE];
  readonly file: FixtureFile;
  readonly detail: string;
}

/** What the fixtures make: the content of the simulated server and the accounts that can sign in. */
export interface SeedData {
  /** The accounts that can sign in. */
  readonly accounts: readonly DemoAccount[];
  /** The demo user: the account that is signed in at start by the mock configuration. */
  readonly demoUser: User;
  readonly content: ServerContent;
}

function fixtureError(
  code: FixtureError['code'],
  file: FixtureFile,
  place: string,
  reason?: string,
): FixtureError {
  const suffix = reason === undefined ? '' : ` (${reason})`;
  return { code, file, detail: `${file}: ${place}${suffix}` };
}

function violation({ field, rule }: ValidationError): string {
  return `${field} ${rule}`;
}

/** The content of a file, if it has the shape of its schema. */
function parseFile<S extends z.ZodType>(
  file: FixtureFile,
  schema: S,
  content: unknown,
): Result<z.output<S>, FixtureError> {
  const parsed = schema.safeParse(content);
  return parsed.success
    ? ok(parsed.data)
    : err(fixtureError(FIXTURE_ERROR_CODE.InvalidShape, file, issuePathsOf(parsed.error)));
}

/** The members of a list through `read`, or the position of the first one it refuses. */
function readAll<W, T>(
  file: FixtureFile,
  list: string,
  members: readonly W[],
  read: (member: W) => Result<T, ValidationError>,
): Result<T[], FixtureError> {
  const values: T[] = [];
  for (const [index, member] of members.entries()) {
    const value = read(member);
    if (!value.ok) {
      return err(
        fixtureError(
          FIXTURE_ERROR_CODE.InvalidValue,
          file,
          `${list}.${index}`,
          violation(value.error),
        ),
      );
    }
    values.push(value.value);
  }
  return ok(values);
}

/** The place of the first member whose key is the one of an earlier member, or `undefined`. */
function firstDuplicate<T>(
  members: readonly T[],
  keyOf: (member: T) => string,
): number | undefined {
  const seen = new Set<string>();
  for (const [index, member] of members.entries()) {
    const key = keyOf(member);
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return undefined;
}

type ParsedMeeting = z.output<typeof meetingSchema>;
type ParsedVote = z.output<typeof recordedVotesFileSchema>['recordedVotes'][number];

/**
 * The shift of the dates of the files, in milliseconds: a whole number of days, the number of
 * complete days from the reference date to `now`. A `now` before the reference date gives a negative
 * number of days, rounded to the earlier day (`floor`, not truncation towards zero): one millisecond
 * before the reference date is a day back.
 */
function shiftOf(now: Instant, referenceDate: number): number {
  return Math.floor((now - referenceDate) / MILLIS_PER_DAY) * MILLIS_PER_DAY;
}

/**
 * The place of the first instant of the files that the whole-day shift could move to the other
 * side of the clock, or `undefined`: a meeting or a closing time less than the margin from the
 * reference date (either side), or a vote cast after it.
 */
function timelineViolation(
  meetings: readonly ParsedMeeting[],
  votes: readonly ParsedVote[],
  referenceDate: number,
): FixtureError | undefined {
  const tooClose = (instant: number): boolean =>
    Math.abs(instant - referenceDate) < TIMELINE_MARGIN_MILLIS;
  const flaw = (file: FixtureFile, place: string): FixtureError =>
    fixtureError(FIXTURE_ERROR_CODE.TimelineMargin, file, place);

  for (const [index, meeting] of meetings.entries()) {
    if (tooClose(meeting.scheduledAt))
      return flaw(FIXTURE_FILE.Meetings, `meetings.${index}.scheduledAt`);
    for (const [position, item] of meeting.agenda.entries()) {
      const closesAt = item.resolution?.closesAt;
      if (closesAt !== undefined && tooClose(closesAt)) {
        return flaw(
          FIXTURE_FILE.Meetings,
          `meetings.${index}.agenda.${position}.resolution.closesAt`,
        );
      }
    }
  }
  for (const [index, vote] of votes.entries()) {
    if (vote.castAt > referenceDate)
      return flaw(FIXTURE_FILE.RecordedVotes, `recordedVotes.${index}.castAt`);
  }
  return undefined;
}

/** The meeting with every instant moved by `delta` milliseconds. The domain checks the result. */
function shiftMeeting(meeting: ParsedMeeting, delta: number): ParsedMeeting {
  return {
    ...meeting,
    scheduledAt: meeting.scheduledAt + delta,
    agenda: meeting.agenda.map((item) => {
      const { resolution } = item;
      if (resolution === undefined) return item;
      return {
        ...item,
        resolution: {
          ...resolution,
          ...(resolution.closesAt === undefined ? {} : { closesAt: resolution.closesAt + delta }),
        },
      };
    }),
  };
}

/** The meeting that holds each resolution, to check what the recorded votes point to. */
function meetingsByResolution(meetings: readonly Meeting[]): Map<ResolutionId, Meeting> {
  const held = new Map<ResolutionId, Meeting>();
  for (const meeting of meetings) {
    for (const item of meeting.agenda) {
      if (item.resolution !== undefined) held.set(item.resolution.id, meeting);
    }
  }
  return held;
}

/** The position of the first meeting that lists a document an earlier meeting lists, or `undefined`. */
function firstSharedDocument(meetings: readonly Meeting[]): number | undefined {
  const seen = new Set<string>();
  for (const [index, meeting] of meetings.entries()) {
    for (const { id } of meeting.documents) {
      if (seen.has(id)) return index;
      seen.add(id);
    }
  }
  return undefined;
}

/**
 * The content of the simulated server read from the fixtures, with every date shifted by a whole
 * number of days (the complete days from the reference date to `now`, see `shiftOf`), or the first
 * flaw found: a file that breaks its schema, files from different generations, a meeting or a
 * closing time within a day of the reference date, a value that breaks a rule of the domain, an id
 * that points to nothing, a duplicate. Nothing is thrown.
 */
export function loadFixtures(files: FixtureFiles, now: Instant): Result<SeedData, FixtureError> {
  const accountsFile = parseFile(FIXTURE_FILE.Accounts, accountsFileSchema, files.accounts);
  if (!accountsFile.ok) return accountsFile;
  const meetingsFile = parseFile(FIXTURE_FILE.Meetings, meetingsFileSchema, files.meetings);
  if (!meetingsFile.ok) return meetingsFile;
  const votesFile = parseFile(
    FIXTURE_FILE.RecordedVotes,
    recordedVotesFileSchema,
    files.recordedVotes,
  );
  if (!votesFile.ok) return votesFile;

  const { referenceDate } = accountsFile.value;
  for (const [file, date] of [
    [FIXTURE_FILE.Meetings, meetingsFile.value.referenceDate],
    [FIXTURE_FILE.RecordedVotes, votesFile.value.referenceDate],
  ] as const) {
    if (date !== referenceDate) {
      return err(fixtureError(FIXTURE_ERROR_CODE.ReferenceDateMismatch, file, 'referenceDate'));
    }
  }
  const delta = shiftOf(now, referenceDate);

  const read = readAll(
    FIXTURE_FILE.Accounts,
    'accounts',
    accountsFile.value.accounts,
    ({ user, password }) =>
      map(toUser(user), (readUser): DemoAccount => ({ user: readUser, password })),
  );
  if (!read.ok) return read;
  const accounts = read.value;
  const duplicateAccount =
    firstDuplicate(accounts, ({ user }) => user.id) ??
    firstDuplicate(accounts, ({ user }) => user.email);
  if (duplicateAccount !== undefined) {
    return err(
      fixtureError(
        FIXTURE_ERROR_CODE.Duplicate,
        FIXTURE_FILE.Accounts,
        `accounts.${duplicateAccount}`,
      ),
    );
  }
  const demoUser = accounts.find(({ user }) => user.id === accountsFile.value.demoUserId)?.user;
  if (demoUser === undefined) {
    return err(
      fixtureError(FIXTURE_ERROR_CODE.UnknownReference, FIXTURE_FILE.Accounts, 'demoUserId'),
    );
  }

  const outOfMargin = timelineViolation(
    meetingsFile.value.meetings,
    votesFile.value.recordedVotes,
    referenceDate,
  );
  if (outOfMargin !== undefined) return err(outOfMargin);

  const meetings = readAll(
    FIXTURE_FILE.Meetings,
    'meetings',
    meetingsFile.value.meetings,
    (meeting) => toMeeting(shiftMeeting(meeting, delta)),
  );
  if (!meetings.ok) return meetings;
  const duplicateMeeting = firstDuplicate(meetings.value, ({ id }) => id);
  if (duplicateMeeting !== undefined) {
    return err(
      fixtureError(
        FIXTURE_ERROR_CODE.Duplicate,
        FIXTURE_FILE.Meetings,
        `meetings.${duplicateMeeting}.id`,
      ),
    );
  }
  const sharedDocument = firstSharedDocument(meetings.value);
  if (sharedDocument !== undefined) {
    return err(
      fixtureError(
        FIXTURE_ERROR_CODE.Duplicate,
        FIXTURE_FILE.Meetings,
        `meetings.${sharedDocument}.documents`,
      ),
    );
  }

  const recordedVotes = readAll(
    FIXTURE_FILE.RecordedVotes,
    'recordedVotes',
    votesFile.value.recordedVotes,
    (vote) => toVote({ ...vote, castAt: vote.castAt + delta }),
  );
  if (!recordedVotes.ok) return recordedVotes;
  const unknown = unknownReference(meetings.value, recordedVotes.value);
  if (unknown !== undefined) return err(unknown);
  const duplicateVote = firstDuplicate(recordedVotes.value, ({ idempotencyKey }) => idempotencyKey);
  if (duplicateVote !== undefined) {
    return err(
      fixtureError(
        FIXTURE_ERROR_CODE.Duplicate,
        FIXTURE_FILE.RecordedVotes,
        `recordedVotes.${duplicateVote}`,
      ),
    );
  }

  return ok({
    accounts,
    demoUser,
    content: { meetings: meetings.value, recordedVotes: recordedVotes.value },
  });
}

/** The first recorded vote that points to a resolution, a meeting or a voter the files do not have. */
function unknownReference(
  meetings: readonly Meeting[],
  votes: readonly Vote[],
): FixtureError | undefined {
  const held = meetingsByResolution(meetings);
  const unknown = (place: string): FixtureError =>
    fixtureError(FIXTURE_ERROR_CODE.UnknownReference, FIXTURE_FILE.RecordedVotes, place);
  for (const [index, vote] of votes.entries()) {
    const meeting = held.get(vote.resolutionId);
    if (meeting === undefined) return unknown(`recordedVotes.${index}.resolutionId`);
    if (meeting.id !== vote.meetingId) return unknown(`recordedVotes.${index}.meetingId`);
    if (findParticipant(meeting, vote.voterId) === undefined) {
      return unknown(`recordedVotes.${index}.voterId`);
    }
  }
  return undefined;
}
