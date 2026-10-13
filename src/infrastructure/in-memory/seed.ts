import { createAgendaItem } from '@domain/entities/AgendaItem';
import type { AgendaItem } from '@domain/entities/AgendaItem';
import { CONFIDENTIALITY_LEVEL, createDocument } from '@domain/entities/Document';
import type { ConfidentialityLevel, Document } from '@domain/entities/Document';
import { createMeeting } from '@domain/entities/Meeting';
import type { Meeting } from '@domain/entities/Meeting';
import { createMeetingSummary } from '@domain/entities/MeetingSummary';
import { PARTICIPANT_ROLE, createParticipant, hasVotingRights } from '@domain/entities/Participant';
import type { Participant, ParticipantRole } from '@domain/entities/Participant';
import { RESOLUTION_STATUS, createResolution } from '@domain/entities/Resolution';
import type { Resolution, ResolutionStatus } from '@domain/entities/Resolution';
import { createUser } from '@domain/entities/User';
import type { User } from '@domain/entities/User';
import { createVote } from '@domain/entities/Vote';
import type { Vote } from '@domain/entities/Vote';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { parseEmailAddress } from '@domain/value-objects/EmailAddress';
import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from '@domain/value-objects/ids';
import { parseInstant } from '@domain/value-objects/Instant';
import type { Instant } from '@domain/value-objects/Instant';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';

import { InvalidStaticValueError, valid } from '../shared/valid';

import type { DemoAccount } from './InMemoryAuthSession';
import type { ServerContent } from './InMemoryBackend';

// The content of the simulated server. It is server data, not user interface text: it is written
// in English, whatever the language of the app, and the screens show it as it comes. Everything is
// built through the domain factories, so a seed that breaks an invariant fails when the seed is
// built (`buildSeed` returns the error, and the tests of this module fail with it).

/**
 * The password of the demo accounts. It protects nothing: the accounts exist only in the
 * simulation, and it is documented in the README so that anybody can sign in.
 */
export const DEMO_PASSWORD = 'boardroom-demo';

const MILLIS_PER_HOUR = 3_600_000;
const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

/** How many meetings of each period the server holds: several pages of each at the page sizes the app uses. */
export const UPCOMING_MEETING_COUNT = 24;
export const PAST_MEETING_COUNT = 42;

/** The first upcoming meeting is this many days away, the following ones `UPCOMING_SPACING_DAYS` apart. */
const FIRST_UPCOMING_DAYS = 2;
const UPCOMING_SPACING_DAYS = 3;
/** The latest past meeting was this many days ago, the earlier ones `PAST_SPACING_DAYS` apart. */
const LATEST_PAST_DAYS = 1;
const PAST_SPACING_DAYS = 4;

/** Hours of the day (UTC) the meetings start at, in turn. */
const START_HOURS = [9, 10, 14, 16] as const;
/** A vote on a resolution of a past meeting stayed open this long after the meeting started. */
const PAST_VOTING_HOURS = 2;
/**
 * A vote on a resolution of an upcoming meeting closes this long after the meeting starts, in turn:
 * always after it, so that the vote is still open when the meeting takes place. The last is the day
 * after, for the members who vote once they have read the minutes.
 */
const UPCOMING_DEADLINE_HOURS = [2, 4, 24] as const;
/** One upcoming meeting in this many has resolutions with no closing time (the remainder is 1). */
const UNTIMED_UPCOMING_EVERY = 5;
const UNTIMED_UPCOMING_REMAINDER = 1;
/**
 * One past meeting in this many (counting back from the latest, the remainder is 1) has resolutions
 * whose status was never set to closed: their voting window is over and nobody voted. It is the
 * state a screen must not call open.
 */
const LAPSED_PAST_EVERY = 8;
const LAPSED_PAST_REMAINDER = 1;

/** The upcoming meeting where the demo user already voted on the minutes, still open. */
const VOTED_UPCOMING_SEQUENCE = 0;
/** Where the demo user attends as a guest (no vote), and as the secretary (no vote). */
const ALICE_GUEST_SEQUENCES: ReadonlySet<number> = new Set([3, 30]);
const ALICE_SECRETARY_SEQUENCES: ReadonlySet<number> = new Set([12]);
/** The demo user chairs every n-th meeting. */
const ALICE_CHAIR_EVERY = 7;
/** The second demo user is absent from one meeting in this many. */
const BRUNO_ABSENT_EVERY = 3;
/** The demo user did not vote on one past meeting in this many. */
const ALICE_ABSTAINED_EVERY = 5;
const BRUNO_VOTES_EVERY = 3;
/** Votes of the demo user on the past meetings, in turn: all three choices come up. */
const ALICE_VOTE_PATTERN: readonly VoteChoice[] = [
  VOTE_CHOICE.For,
  VOTE_CHOICE.Against,
  VOTE_CHOICE.For,
  VOTE_CHOICE.Abstain,
  VOTE_CHOICE.For,
  VOTE_CHOICE.For,
  VOTE_CHOICE.Against,
];
/** Votes of the other seats, in turn: mostly for. */
const VOTE_PATTERN: readonly VoteChoice[] = [
  VOTE_CHOICE.For,
  VOTE_CHOICE.For,
  VOTE_CHOICE.For,
  VOTE_CHOICE.Against,
  VOTE_CHOICE.Abstain,
];

const MONTH_FORMAT = new Intl.DateTimeFormat('en', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface MeetingKind {
  readonly committee: string;
  readonly subject: string;
  readonly resolutionTitle: string;
  readonly resolutionDescription: string;
  readonly reportTitle: string;
  readonly reportConfidentiality: ConfidentialityLevel;
  readonly reportPages: number;
}

const MEETING_KINDS: readonly MeetingKind[] = [
  {
    committee: 'Audit committee',
    subject: 'Half-year financial statements',
    resolutionTitle: 'Approve the half-year financial statements',
    resolutionDescription:
      'The board approves the consolidated financial statements for the first half of the year, as presented by the chief financial officer.',
    reportTitle: 'Consolidated half-year financial statements',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 38,
  },
  {
    committee: 'Board of directors',
    subject: 'Annual budget',
    resolutionTitle: 'Approve the annual budget',
    resolutionDescription:
      'The board approves the budget of the next financial year, including the investment envelope and the hiring plan.',
    reportTitle: 'Budget proposal',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 52,
  },
  {
    committee: 'Board of directors',
    subject: 'Dividend policy',
    resolutionTitle: 'Approve the dividend proposal',
    resolutionDescription:
      'The board approves the dividend to be proposed to the shareholders at the next general meeting.',
    reportTitle: 'Dividend recommendation',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 12,
  },
  {
    committee: 'Risk committee',
    subject: 'Cybersecurity review',
    resolutionTitle: 'Approve the cybersecurity action plan',
    resolutionDescription:
      'The committee approves the action plan that follows the penetration tests of the year.',
    reportTitle: 'Cybersecurity incident report',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 27,
  },
  {
    committee: 'Strategy committee',
    subject: 'Acquisition of a logistics company',
    resolutionTitle: 'Authorise the acquisition offer',
    resolutionDescription:
      'The committee authorises the chief executive to submit a binding offer within the limits of the approved valuation.',
    reportTitle: 'Due diligence summary',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 64,
  },
  {
    committee: 'Remuneration committee',
    subject: 'Executive remuneration',
    resolutionTitle: 'Approve the executive remuneration policy',
    resolutionDescription:
      'The committee approves the remuneration policy of the executive team for the coming year.',
    reportTitle: 'Remuneration benchmark study',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 31,
  },
  {
    committee: 'Board of directors',
    subject: 'Sustainability report',
    resolutionTitle: 'Approve the sustainability report',
    resolutionDescription:
      'The board approves the sustainability report published with the annual report.',
    reportTitle: 'Sustainability report draft',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Internal,
    reportPages: 44,
  },
  {
    committee: 'Audit committee',
    subject: 'Internal audit plan',
    resolutionTitle: 'Approve the internal audit plan',
    resolutionDescription:
      'The committee approves the programme of internal audits for the next twelve months.',
    reportTitle: 'Internal audit plan',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Internal,
    reportPages: 18,
  },
  {
    committee: 'Nominations committee',
    subject: 'Board succession planning',
    resolutionTitle: 'Approve the board succession plan',
    resolutionDescription:
      'The committee approves the succession plan for the directors whose term ends next year.',
    reportTitle: 'Candidate profiles',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 22,
  },
  {
    committee: 'Board of directors',
    subject: 'Credit facility renewal',
    resolutionTitle: 'Authorise the renewal of the credit facility',
    resolutionDescription:
      'The board authorises the chief financial officer to renew the revolving credit facility on the terms presented.',
    reportTitle: 'Credit facility term sheet',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 9,
  },
  {
    committee: 'Risk committee',
    subject: 'Regulatory compliance update',
    resolutionTitle: 'Approve the compliance programme',
    resolutionDescription:
      'The committee approves the compliance programme for the new regulatory requirements.',
    reportTitle: 'Compliance dashboard',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Internal,
    reportPages: 15,
  },
  {
    committee: 'Strategy committee',
    subject: 'Five-year strategic plan',
    resolutionTitle: 'Approve the five-year strategic plan',
    resolutionDescription:
      'The committee approves the strategic plan and recommends it to the board of directors.',
    reportTitle: 'Strategic plan',
    reportConfidentiality: CONFIDENTIALITY_LEVEL.Confidential,
    reportPages: 80,
  },
];

const LOCATIONS = [
  'Boardroom, 12th floor',
  'Paris head office, Seine room',
  'Video conference',
  'London office, Thames room',
  'Hotel Marais, Opera suite',
] as const;

const MINUTES_RESOLUTION = {
  title: 'Approve the minutes of the previous meeting',
  description: 'The board approves the minutes of its previous meeting as they were circulated.',
} as const;

/** The people around the table besides the two demo users. */
const COLLEAGUES = [
  { id: 'user-emma', fullName: 'Emma Laurent' },
  { id: 'user-farid', fullName: 'Farid Haddad' },
  { id: 'user-grace', fullName: 'Grace Okafor' },
  { id: 'user-hugo', fullName: 'Hugo Bernard' },
] as const;

const SECRETARY = { id: 'user-chloe', fullName: 'Chloe Petit' } as const;
const DIRECTOR = { id: 'user-david', fullName: 'David Roux' } as const;

export interface SeedData {
  /** The accounts that can sign in: the first one is the demo user. */
  readonly accounts: readonly DemoAccount[];
  /** The demo user: the first account, signed in at start by the mock configuration. */
  readonly demoUser: User;
  readonly content: ServerContent;
}

/** Why the seed could not be built: a value of the seed broke an invariant of the domain. */
interface SeedError {
  readonly detail: string;
}

/**
 * The seed of the simulated server, generated relative to `now` so that there are always upcoming
 * and past meetings whenever the app starts: `UPCOMING_MEETING_COUNT` meetings ahead and
 * `PAST_MEETING_COUNT` behind, nothing random, so that two runs at the same instant give the same
 * data.
 *
 * Two demo accounts: Alice Martin, who is a voting member of most meetings, chairs some, attends
 * two as a guest and one as the secretary (no vote in those); and Bruno Durand, who is in two
 * meetings out of three, so that the two users see different lists.
 *
 * The state of the resolutions follows from the date of the meeting. In an upcoming meeting they
 * are open, with a closing time after the meeting starts (or none), and most are still to be voted
 * on; Alice voted on the minutes of one of them. In a past meeting they were closed after the
 * meeting started, with the votes of the demo users on most of them (Alice voted for, against and
 * abstained in turn), except in some meetings where the status was never closed although the voting
 * window is over, so that every state a screen can show is in the data.
 */
export function buildSeed(now: Instant): Result<SeedData, SeedError> {
  try {
    return ok(assemble(now));
  } catch (error) {
    if (error instanceof InvalidStaticValueError) return err({ detail: error.detail });
    throw error;
  }
}

function assemble(now: Instant): SeedData {
  const alice = demoUser('user-alice', 'Alice Martin', 'alice.martin@boardroom.example');
  const bruno = demoUser('user-bruno', 'Bruno Durand', 'bruno.durand@boardroom.example');

  const meetings: Meeting[] = [];
  const recordedVotes: Vote[] = [];
  const total = UPCOMING_MEETING_COUNT + PAST_MEETING_COUNT;
  for (let sequence = 0; sequence < total; sequence += 1) {
    const upcoming = sequence < UPCOMING_MEETING_COUNT;
    const offsetDays = upcoming
      ? FIRST_UPCOMING_DAYS + sequence * UPCOMING_SPACING_DAYS
      : -(LATEST_PAST_DAYS + (sequence - UPCOMING_MEETING_COUNT) * PAST_SPACING_DAYS);
    const scheduledAt = startOfDay(now, offsetDays, sequence);
    const built = buildMeeting({ sequence, upcoming, scheduledAt, now, alice, bruno });
    meetings.push(built.meeting);
    recordedVotes.push(...built.votes);
  }

  return {
    accounts: [
      { user: alice, password: DEMO_PASSWORD },
      { user: bruno, password: DEMO_PASSWORD },
    ],
    demoUser: alice,
    content: { meetings, recordedVotes },
  };
}

interface MeetingSpec {
  readonly sequence: number;
  readonly upcoming: boolean;
  readonly scheduledAt: Instant;
  readonly now: Instant;
  readonly alice: User;
  readonly bruno: User;
}

function buildMeeting(spec: MeetingSpec): { meeting: Meeting; votes: Vote[] } {
  const { sequence, scheduledAt } = spec;
  const kind = kindOf(spec);
  const meetingId = valid(parseMeetingId(`meeting-${String(sequence + 1).padStart(3, '0')}`));
  const participants = participantsOf(spec);
  const resolutions = resolutionsOf(spec, kind, meetingId);

  const meeting = valid(
    createMeeting({
      summary: valid(
        createMeetingSummary({
          id: meetingId,
          title: `${kind.committee}: ${kind.subject}, ${MONTH_FORMAT.format(new Date(scheduledAt))}`,
          scheduledAt,
          location: LOCATIONS[sequence % LOCATIONS.length] ?? failMissing('location'),
        }),
      ),
      agenda: agendaOf(meetingId, kind, resolutions),
      documents: documentsOf(sequence, meetingId, kind),
      participants,
    }),
  );

  return { meeting, votes: votesOf(spec, meetingId, participants, resolutions) };
}

/**
 * The kind of meeting, in turn along the calendar: the past meetings count backwards from today and
 * the upcoming ones forwards. Two meetings of the same kind are therefore at least 36 days apart,
 * in different months, so that no two titles are alike.
 */
function kindOf({ sequence, upcoming }: MeetingSpec): MeetingKind {
  const chronological = upcoming ? sequence : -(sequence - UPCOMING_MEETING_COUNT + 1);
  const index =
    ((chronological % MEETING_KINDS.length) + MEETING_KINDS.length) % MEETING_KINDS.length;
  return MEETING_KINDS[index] ?? failMissing('kind');
}

function demoUser(id: string, fullName: string, email: string): User {
  return valid(
    createUser({ id: valid(parseUserId(id)), fullName, email: valid(parseEmailAddress(email)) }),
  );
}

/** The start of the UTC day `offsetDays` from `now`, plus the hour this meeting starts at. */
function startOfDay(now: Instant, offsetDays: number, sequence: number): Instant {
  const day = Math.floor((now + offsetDays * MILLIS_PER_DAY) / MILLIS_PER_DAY) * MILLIS_PER_DAY;
  const hour = START_HOURS[sequence % START_HOURS.length] ?? failMissing('hour');
  return valid(parseInstant(day + hour * MILLIS_PER_HOUR));
}

function participantsOf(spec: MeetingSpec): Participant[] {
  const { sequence, alice, bruno } = spec;
  const aliceRole = aliceRoleOf(sequence);
  const brunoPresent = sequence % BRUNO_ABSENT_EVERY !== 2;
  const brunoRole =
    aliceRole === PARTICIPANT_ROLE.Chair ? PARTICIPANT_ROLE.Member : PARTICIPANT_ROLE.Chair;

  const seats: { id: string; fullName: string; role: ParticipantRole }[] = [
    { id: alice.id, fullName: alice.fullName, role: aliceRole },
    ...(brunoPresent ? [{ id: bruno.id, fullName: bruno.fullName, role: brunoRole }] : []),
    {
      ...SECRETARY,
      role:
        aliceRole === PARTICIPANT_ROLE.Secretary
          ? PARTICIPANT_ROLE.Member
          : PARTICIPANT_ROLE.Secretary,
    },
    { ...DIRECTOR, role: PARTICIPANT_ROLE.Member },
  ];
  for (const offset of [0, 1]) {
    const colleague =
      COLLEAGUES[(sequence + offset) % COLLEAGUES.length] ?? failMissing('colleague');
    seats.push({
      ...colleague,
      role: (sequence + offset) % 2 === 0 ? PARTICIPANT_ROLE.Member : PARTICIPANT_ROLE.Guest,
    });
  }

  return seats.map((seat) =>
    valid(
      createParticipant({
        userId: valid(parseUserId(seat.id)),
        fullName: seat.fullName,
        role: seat.role,
      }),
    ),
  );
}

function aliceRoleOf(sequence: number): ParticipantRole {
  if (ALICE_GUEST_SEQUENCES.has(sequence)) return PARTICIPANT_ROLE.Guest;
  if (ALICE_SECRETARY_SEQUENCES.has(sequence)) return PARTICIPANT_ROLE.Secretary;
  return sequence % ALICE_CHAIR_EVERY === 0 ? PARTICIPANT_ROLE.Chair : PARTICIPANT_ROLE.Member;
}

interface Resolutions {
  /** Approval of the minutes: only some meetings have one. */
  readonly minutes: Resolution | undefined;
  readonly subject: Resolution;
}

function resolutionsOf(
  spec: MeetingSpec,
  kind: MeetingKind,
  meetingId: Meeting['id'],
): Resolutions {
  const { sequence, upcoming, scheduledAt } = spec;
  const { status, closesAt } = windowOf(sequence, upcoming, scheduledAt);
  const make = (suffix: string, title: string, description: string): Resolution =>
    valid(
      createResolution({
        id: valid(parseResolutionId(`${meetingId}-resolution-${suffix}`)),
        title,
        description,
        status,
        ...(closesAt === undefined ? {} : { closesAt }),
      }),
    );

  return {
    minutes:
      sequence % 2 === 0
        ? make('minutes', MINUTES_RESOLUTION.title, MINUTES_RESOLUTION.description)
        : undefined,
    subject: make('subject', kind.resolutionTitle, kind.resolutionDescription),
  };
}

/** Whether the voting on the past meeting `sequence` lapsed: its status stayed open past the window. */
function isLapsedPast(sequence: number, upcoming: boolean): boolean {
  return (
    !upcoming && (sequence - UPCOMING_MEETING_COUNT) % LAPSED_PAST_EVERY === LAPSED_PAST_REMAINDER
  );
}

/**
 * Whether a vote is open and when it closes, depending on where the meeting is in time. The closing
 * time is always after the meeting starts: a vote on a meeting that has not taken place is open, and
 * a vote on one that has was closed after it started.
 */
function windowOf(
  sequence: number,
  upcoming: boolean,
  scheduledAt: Instant,
): { status: ResolutionStatus; closesAt: Instant | undefined } {
  if (!upcoming) {
    return {
      status: isLapsedPast(sequence, upcoming) ? RESOLUTION_STATUS.Open : RESOLUTION_STATUS.Closed,
      closesAt: valid(parseInstant(scheduledAt + PAST_VOTING_HOURS * MILLIS_PER_HOUR)),
    };
  }
  if (sequence % UNTIMED_UPCOMING_EVERY === UNTIMED_UPCOMING_REMAINDER) {
    return { status: RESOLUTION_STATUS.Open, closesAt: undefined };
  }
  const hours =
    UPCOMING_DEADLINE_HOURS[sequence % UPCOMING_DEADLINE_HOURS.length] ?? failMissing('deadline');
  return {
    status: RESOLUTION_STATUS.Open,
    closesAt: valid(parseInstant(scheduledAt + hours * MILLIS_PER_HOUR)),
  };
}

function agendaOf(
  meetingId: Meeting['id'],
  kind: MeetingKind,
  resolutions: Resolutions,
): AgendaItem[] {
  const items: { title: string; description?: string; resolution?: Resolution }[] = [
    { title: 'Opening and attendance' },
    {
      title: 'Approval of the minutes of the previous meeting',
      ...(resolutions.minutes === undefined ? {} : { resolution: resolutions.minutes }),
    },
    {
      title: kind.subject,
      description: `Presentation and discussion of the ${kind.subject.toLowerCase()}.`,
      resolution: resolutions.subject,
    },
    { title: 'Any other business' },
  ];
  return items.map((item, index) =>
    valid(
      createAgendaItem({
        id: valid(parseAgendaItemId(`${meetingId}-item-${index + 1}`)),
        position: index + 1,
        ...item,
      }),
    ),
  );
}

function documentsOf(sequence: number, meetingId: Meeting['id'], kind: MeetingKind): Document[] {
  const documents: { title: string; confidentiality: ConfidentialityLevel; pageCount: number }[] = [
    {
      title: 'Agenda and board pack',
      confidentiality: CONFIDENTIALITY_LEVEL.Internal,
      pageCount: 24,
    },
    {
      title: kind.reportTitle,
      confidentiality: kind.reportConfidentiality,
      pageCount: kind.reportPages,
    },
  ];
  if (sequence % 3 !== 0) {
    documents.push({
      title: 'Minutes of the previous meeting',
      confidentiality: CONFIDENTIALITY_LEVEL.Public,
      pageCount: 6,
    });
  }
  return documents.map((document, index) =>
    valid(
      createDocument({
        id: valid(parseDocumentId(`${meetingId}-document-${index + 1}`)),
        ...document,
      }),
    ),
  );
}

/** The votes already recorded for this meeting: only the demo users have voted so far. */
function votesOf(
  spec: MeetingSpec,
  meetingId: Meeting['id'],
  participants: readonly Participant[],
  resolutions: Resolutions,
): Vote[] {
  const { sequence, upcoming, scheduledAt, now, alice, bruno } = spec;
  const castAt = upcoming ? valid(parseInstant(now - 2 * MILLIS_PER_HOUR)) : scheduledAt;
  // Nobody voted before the window lapsed.
  if (isLapsedPast(sequence, upcoming)) return [];

  const hasVoted = (user: User): boolean => {
    const seat = participants.find((participant) => participant.userId === user.id);
    if (seat === undefined || !hasVotingRights(seat)) return false;
    if (upcoming) return user.id === alice.id && sequence === VOTED_UPCOMING_SEQUENCE;
    return user.id === alice.id
      ? sequence % ALICE_ABSTAINED_EVERY !== 4
      : sequence % BRUNO_VOTES_EVERY === 0;
  };

  const votes: Vote[] = [];
  for (const user of [alice, bruno]) {
    if (!hasVoted(user)) continue;
    // On the upcoming meeting where the demo user already voted, only the minutes are done: the
    // main resolution is still theirs to vote on.
    const voted = upcoming ? [resolutions.minutes] : [resolutions.minutes, resolutions.subject];
    for (const resolution of voted) {
      if (resolution === undefined) continue;
      votes.push(
        createVote({
          resolutionId: resolution.id,
          meetingId,
          voterId: user.id,
          choice: choiceOf(user === alice, sequence + votes.length),
          castAt,
        }),
      );
    }
  }
  return votes;
}

/** The choice of a vote: the demo user's come in a fixed turn, the others' are mostly for. */
function choiceOf(isDemoUser: boolean, ordinal: number): VoteChoice {
  const pattern = isDemoUser ? ALICE_VOTE_PATTERN : VOTE_PATTERN;
  return pattern[ordinal % pattern.length] ?? VOTE_CHOICE.For;
}

/** A table lookup that cannot miss: the index is taken modulo the length of the table. */
function failMissing(what: string): never {
  throw new InvalidStaticValueError(`no ${what} in the seed tables`);
}
