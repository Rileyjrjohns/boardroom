import type { AgendaItem, AgendaItemInput } from '../entities/AgendaItem';
import { createAgendaItem } from '../entities/AgendaItem';
import type { Document, DocumentInput } from '../entities/Document';
import { CONFIDENTIALITY_LEVEL, createDocument } from '../entities/Document';
import type { Meeting, MeetingInput } from '../entities/Meeting';
import { createMeeting } from '../entities/Meeting';
import type { MeetingSummary, MeetingSummaryInput } from '../entities/MeetingSummary';
import { createMeetingSummary } from '../entities/MeetingSummary';
import type { Participant, ParticipantInput } from '../entities/Participant';
import { PARTICIPANT_ROLE, createParticipant } from '../entities/Participant';
import { createPendingVote, rejectVote } from '../entities/OutboxVote';
import type { PendingVote, RejectedVote } from '../entities/OutboxVote';
import type { Resolution, ResolutionInput } from '../entities/Resolution';
import { RESOLUTION_STATUS, createResolution } from '../entities/Resolution';
import type { Session } from '../entities/Session';
import { createSession } from '../entities/Session';
import type { User, UserInput } from '../entities/User';
import { createUser } from '../entities/User';
import type { Vote, VoteInput } from '../entities/Vote';
import { createVote } from '../entities/Vote';
import type { Result } from '../shared/Result';
import { parseDocumentLocation } from '../value-objects/DocumentLocation';
import type { DocumentLocation } from '../value-objects/DocumentLocation';
import { durationFromMillis } from '../value-objects/Duration';
import type { Duration } from '../value-objects/Duration';
import { parseEmailAddress } from '../value-objects/EmailAddress';
import type { EmailAddress } from '../value-objects/EmailAddress';
import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from '../value-objects/ids';
import type {
  AgendaItemId,
  DocumentId,
  MeetingId,
  ResolutionId,
  UserId,
} from '../value-objects/ids';
import { parseInstant, plus } from '../value-objects/Instant';
import type { Instant } from '../value-objects/Instant';
import { VOTING_ERROR_CODE } from '../errors/VotingError';
import { VOTE_CHOICE } from '../value-objects/VoteChoice';

// Test support, not production code: the files of a `testing` folder may throw, which is how a
// fixture that breaks an invariant fails the test that uses it. Nothing in the app imports them
// (a lint rule enforces it).

/** The value of a success. A failure is a broken fixture, and it fails the test with its error. */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Invalid fixture: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** The instant of the tests: 2030-03-17T17:46:40Z. Nothing in a test reads the real clock. */
export const NOW: Instant = unwrap(parseInstant(1_900_000_000_000));

export const MILLIS_PER_MINUTE = 60_000;
export const MILLIS_PER_HOUR = 60 * MILLIS_PER_MINUTE;
export const MILLIS_PER_DAY = 24 * MILLIS_PER_HOUR;

/** `NOW` shifted by `millis`, which may be negative. */
export function at(millis: number): Instant {
  return unwrap(parseInstant(NOW + millis));
}

/** `instant` shifted forward by `millis`. */
export function after(instant: Instant, millis: number): Instant {
  return unwrap(plus(instant, unwrap(durationFromMillis(millis))));
}

export function aDuration(millis: number): Duration {
  return unwrap(durationFromMillis(millis));
}

export function aUserId(raw = 'user-1'): UserId {
  return unwrap(parseUserId(raw));
}

export function aMeetingId(raw = 'meeting-1'): MeetingId {
  return unwrap(parseMeetingId(raw));
}

export function anAgendaItemId(raw = 'agenda-1'): AgendaItemId {
  return unwrap(parseAgendaItemId(raw));
}

export function aResolutionId(raw = 'resolution-1'): ResolutionId {
  return unwrap(parseResolutionId(raw));
}

export function aDocumentId(raw = 'document-1'): DocumentId {
  return unwrap(parseDocumentId(raw));
}

export function anEmail(raw = 'alice@example.com'): EmailAddress {
  return unwrap(parseEmailAddress(raw));
}

export function aDocumentLocation(raw = 'file:///documents/document-1.pdf'): DocumentLocation {
  return unwrap(parseDocumentLocation(raw));
}

export function aUser(overrides: Partial<UserInput> = {}): User {
  return unwrap(
    createUser({ id: aUserId(), fullName: 'Alice Martin', email: anEmail(), ...overrides }),
  );
}

/** A session that ends one hour after `NOW`. */
export function aSession(overrides: { user?: User; expiresAt?: Instant } = {}): Session {
  return createSession({ user: aUser(), expiresAt: at(MILLIS_PER_HOUR), ...overrides });
}

/** A member of the board, who can vote. */
export function aParticipant(overrides: Partial<ParticipantInput> = {}): Participant {
  return unwrap(
    createParticipant({
      userId: aUserId(),
      fullName: 'Alice Martin',
      role: PARTICIPANT_ROLE.Member,
      ...overrides,
    }),
  );
}

/** An internal document of three pages. */
export function aDocument(overrides: Partial<DocumentInput> = {}): Document {
  return unwrap(
    createDocument({
      id: aDocumentId(),
      title: 'Financial statements',
      confidentiality: CONFIDENTIALITY_LEVEL.Internal,
      pageCount: 3,
      ...overrides,
    }),
  );
}

/** A confidential document of three pages. */
export function aConfidentialDocument(overrides: Partial<DocumentInput> = {}): Document {
  return aDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Confidential, ...overrides });
}

/** An open resolution, without a closing instant and without a recorded vote. */
export function aResolution(overrides: Partial<ResolutionInput> = {}): Resolution {
  return unwrap(
    createResolution({
      id: aResolutionId(),
      title: 'Approve the budget',
      description: 'Approve the budget of the next financial year.',
      status: RESOLUTION_STATUS.Open,
      ...overrides,
    }),
  );
}

export function anAgendaItem(overrides: Partial<AgendaItemInput> = {}): AgendaItem {
  return unwrap(
    createAgendaItem({
      id: anAgendaItemId(),
      position: 1,
      title: 'Budget',
      resolution: aResolution(),
      ...overrides,
    }),
  );
}

/** A meeting scheduled one day after `NOW`. */
export function aMeetingSummary(overrides: Partial<MeetingSummaryInput> = {}): MeetingSummary {
  return unwrap(
    createMeetingSummary({
      id: aMeetingId(),
      title: 'Board of directors',
      scheduledAt: at(MILLIS_PER_DAY),
      location: 'Room 1',
      ...overrides,
    }),
  );
}

/**
 * A meeting with one agenda item holding an open resolution (`aResolutionId()`), one confidential
 * document (`aDocumentId()`), and four participants: `user-1` is a member and can vote, `user-2`
 * is the chair and can vote, `user-3` is the secretary and `user-4` a guest, who cannot.
 */
export function aMeeting(overrides: Partial<MeetingInput> = {}): Meeting {
  return unwrap(
    createMeeting({
      summary: aMeetingSummary(),
      agenda: [anAgendaItem()],
      documents: [aConfidentialDocument()],
      participants: [
        aParticipant(),
        aParticipant({
          userId: aUserId('user-2'),
          fullName: 'Bruno Durand',
          role: PARTICIPANT_ROLE.Chair,
        }),
        aParticipant({
          userId: aUserId('user-3'),
          fullName: 'Chloe Petit',
          role: PARTICIPANT_ROLE.Secretary,
        }),
        aParticipant({
          userId: aUserId('user-4'),
          fullName: 'David Roux',
          role: PARTICIPANT_ROLE.Guest,
        }),
      ],
      ...overrides,
    }),
  );
}

/**
 * The same meeting with a longer agenda: an item without resolution (position 1), then the open
 * resolution `aResolutionId()` in the item at position 2, then another open resolution,
 * `aResolutionId('resolution-2')`, in the item at position 3. Whatever looks only at the first
 * item of the agenda finds nothing here.
 */
export function aMeetingWithAgenda(overrides: Partial<MeetingInput> = {}): Meeting {
  const base = aMeeting();
  return unwrap(
    createMeeting({
      summary: aMeetingSummary(),
      agenda: [
        unwrap(
          createAgendaItem({
            id: anAgendaItemId('agenda-0'),
            position: 1,
            title: 'Opening',
          }),
        ),
        anAgendaItem({ id: anAgendaItemId('agenda-1'), position: 2 }),
        anAgendaItem({
          id: anAgendaItemId('agenda-2'),
          position: 3,
          title: 'Elections',
          resolution: aResolution({ id: aResolutionId('resolution-2'), title: 'Elect the chair' }),
        }),
      ],
      documents: base.documents,
      participants: base.participants,
      ...overrides,
    }),
  );
}

export function aVote(overrides: Partial<VoteInput> = {}): Vote {
  return createVote({
    resolutionId: aResolutionId(),
    meetingId: aMeetingId(),
    voterId: aUserId(),
    choice: VOTE_CHOICE.For,
    castAt: NOW,
    ...overrides,
  });
}

export function aPendingVote(vote: Vote = aVote(), enqueuedAt: Instant = NOW): PendingVote {
  return createPendingVote(vote, enqueuedAt);
}

/** A vote the server refused because the resolution is closed, one minute after `NOW`. */
export function aRejectedVote(
  vote: Vote = aVote(),
  reason: RejectedVote['reason'] = { code: VOTING_ERROR_CODE.ResolutionClosed },
): RejectedVote {
  return rejectVote(aPendingVote(vote), reason, at(MILLIS_PER_MINUTE));
}
