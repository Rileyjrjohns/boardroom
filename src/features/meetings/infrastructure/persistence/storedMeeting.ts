import { z } from 'zod';

import type { ValidationError } from '@core/domain/errors/ValidationError';
import { andThen, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import { createPage } from '@core/domain/value-objects/Page';
import type { Page } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from '@core/domain/value-objects/ids';
import { collect } from '@core/infrastructure/shared/results';
import { createAgendaItem } from '@features/meetings/domain/entities/AgendaItem';
import type { AgendaItem } from '@features/meetings/domain/entities/AgendaItem';
import {
  createDocument,
  parseConfidentialityLevel,
} from '@features/meetings/domain/entities/Document';
import type { Document } from '@features/meetings/domain/entities/Document';
import { createMeeting } from '@features/meetings/domain/entities/Meeting';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import { createMeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import {
  createParticipant,
  parseParticipantRole,
} from '@features/meetings/domain/entities/Participant';
import type { Participant } from '@features/meetings/domain/entities/Participant';
import {
  createResolution,
  parseResolutionStatus,
} from '@features/meetings/domain/entities/Resolution';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import { parseVoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';

// What the cache of meetings keeps in a row, on the device: the format of the database, which is
// the cache's own and not the API's. It is described here, apart from the DTOs of the API, so that
// a change of the API (a field renamed, an instant written another way) does not make the rows
// that were stored unreadable, and a change of what is stored is a migration of its own. It
// happens to look like what the API wrote when the cache was first written, and the rows that were
// stored then are read as they are (a test holds one, as it was written). Changing it means
// reading the rows of before too, or discarding them on purpose.
//
// A schema checks that each field is there and has the type that was stored, and ignores the ones
// it does not know. The values themselves are checked by the factories of the domain.

/** An instant, stored as an ISO 8601 text with a zone. */
const instantSchema = z.string().transform((text, context) => {
  const millis = Date.parse(text);
  if (Number.isNaN(millis)) {
    context.addIssue({ code: 'custom', message: 'not an instant' });
    return z.NEVER;
  }
  return millis;
});

const storedDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  confidentiality: z.string(),
  pageCount: z.number(),
});

const storedResolutionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  closesAt: instantSchema.optional(),
  recordedVote: z.string().optional(),
});

const storedAgendaItemSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  description: z.string().optional(),
  resolution: storedResolutionSchema.optional(),
});

const storedParticipantSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  role: z.string(),
});

const storedSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  scheduledAt: instantSchema,
  location: z.string(),
});

/** A meeting as the cache keeps it. */
export const storedMeetingSchema = storedSummarySchema.extend({
  agenda: z.array(storedAgendaItemSchema),
  documents: z.array(storedDocumentSchema),
  participants: z.array(storedParticipantSchema),
});

/** A page of the list of meetings as the cache keeps it. */
export const storedMeetingPageSchema = z.object({
  items: z.array(storedSummarySchema),
  nextCursor: z.string().optional(),
});

export type StoredMeeting = z.input<typeof storedMeetingSchema>;
export type StoredMeetingPage = z.input<typeof storedMeetingPageSchema>;

const toIsoString = (instant: number): string => new Date(instant).toISOString();

/** The result of `read` on a value that may be missing: a missing value is a success, with nothing. */
function optional<S, T, E>(
  stored: S | undefined,
  read: (value: S) => Result<T, E>,
): Result<T | undefined, E> {
  return stored === undefined ? ok(undefined) : read(stored);
}

function documentOf(
  stored: z.output<typeof storedDocumentSchema>,
): Result<Document, ValidationError> {
  return andThen(parseDocumentId(stored.id), (id) =>
    andThen(parseConfidentialityLevel(stored.confidentiality), (confidentiality) =>
      createDocument({ id, title: stored.title, confidentiality, pageCount: stored.pageCount }),
    ),
  );
}

function resolutionOf(
  stored: z.output<typeof storedResolutionSchema>,
): Result<Resolution, ValidationError> {
  return andThen(parseResolutionId(stored.id), (id) =>
    andThen(parseResolutionStatus(stored.status), (status) =>
      andThen(optional(stored.closesAt, parseInstant), (closesAt) =>
        andThen(optional(stored.recordedVote, parseVoteChoice), (recordedVote) =>
          createResolution({
            id,
            title: stored.title,
            description: stored.description,
            status,
            ...(closesAt === undefined ? {} : { closesAt }),
            ...(recordedVote === undefined ? {} : { recordedVote }),
          }),
        ),
      ),
    ),
  );
}

function agendaItemOf(
  stored: z.output<typeof storedAgendaItemSchema>,
): Result<AgendaItem, ValidationError> {
  return andThen(parseAgendaItemId(stored.id), (id) =>
    andThen(optional(stored.resolution, resolutionOf), (resolution) =>
      createAgendaItem({
        id,
        position: stored.position,
        title: stored.title,
        ...(stored.description === undefined ? {} : { description: stored.description }),
        ...(resolution === undefined ? {} : { resolution }),
      }),
    ),
  );
}

function participantOf(
  stored: z.output<typeof storedParticipantSchema>,
): Result<Participant, ValidationError> {
  return andThen(parseUserId(stored.userId), (userId) =>
    andThen(parseParticipantRole(stored.role), (role) =>
      createParticipant({ userId, fullName: stored.fullName, role }),
    ),
  );
}

function summaryOf(
  stored: z.output<typeof storedSummarySchema>,
): Result<MeetingSummary, ValidationError> {
  return andThen(parseMeetingId(stored.id), (id) =>
    andThen(parseInstant(stored.scheduledAt), (scheduledAt) =>
      createMeetingSummary({ id, title: stored.title, scheduledAt, location: stored.location }),
    ),
  );
}

/** The meeting a row holds, through the factories of the domain. */
export function meetingOf(
  stored: z.output<typeof storedMeetingSchema>,
): Result<Meeting, ValidationError> {
  return andThen(summaryOf(stored), (summary) =>
    andThen(collect(stored.agenda.map(agendaItemOf)), (agenda) =>
      andThen(collect(stored.documents.map(documentOf)), (documents) =>
        andThen(collect(stored.participants.map(participantOf)), (participants) =>
          createMeeting({ summary, agenda, documents, participants }),
        ),
      ),
    ),
  );
}

/** The page a row holds, through the factories of the domain. */
export function pageOf(
  stored: z.output<typeof storedMeetingPageSchema>,
): Result<Page<MeetingSummary>, ValidationError> {
  return andThen(collect(stored.items.map(summaryOf)), (items) =>
    andThen(optional(stored.nextCursor, parsePageCursor), (nextCursor) =>
      ok(createPage(items, nextCursor)),
    ),
  );
}

function storedSummary(summary: MeetingSummary): z.input<typeof storedSummarySchema> {
  return {
    id: summary.id,
    title: summary.title,
    scheduledAt: toIsoString(summary.scheduledAt),
    location: summary.location,
  };
}

function storedResolution(resolution: Resolution): z.input<typeof storedResolutionSchema> {
  return {
    id: resolution.id,
    title: resolution.title,
    description: resolution.description,
    status: resolution.status,
    ...(resolution.closesAt === undefined ? {} : { closesAt: toIsoString(resolution.closesAt) }),
    ...(resolution.recordedVote === undefined ? {} : { recordedVote: resolution.recordedVote }),
  };
}

function storedAgendaItem(item: AgendaItem): z.input<typeof storedAgendaItemSchema> {
  return {
    id: item.id,
    position: item.position,
    title: item.title,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.resolution === undefined ? {} : { resolution: storedResolution(item.resolution) }),
  };
}

/** What is written in a row for a meeting. */
export function storedMeetingOf(meeting: Meeting): StoredMeeting {
  return {
    ...storedSummary(meeting),
    agenda: meeting.agenda.map(storedAgendaItem),
    documents: meeting.documents.map((document) => ({
      id: document.id,
      title: document.title,
      confidentiality: document.confidentiality,
      pageCount: document.pageCount,
    })),
    participants: meeting.participants.map((participant) => ({
      userId: participant.userId,
      fullName: participant.fullName,
      role: participant.role,
    })),
  };
}

/** What is written in a row for a page of the list. */
export function storedPageOf(page: Page<MeetingSummary>): StoredMeetingPage {
  return {
    items: page.items.map(storedSummary),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  };
}
