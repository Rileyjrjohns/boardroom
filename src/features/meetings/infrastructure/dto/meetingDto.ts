import { z } from 'zod';

import type { ValidationError } from '@core/domain/errors/ValidationError';
import { andThen, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import type { Page } from '@core/domain/value-objects/Page';
import { createPage } from '@core/domain/value-objects/Page';
import { parsePageCursor } from '@core/domain/value-objects/PageCursor';
import {
  parseAgendaItemId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from '@core/domain/value-objects/ids';
import { isoInstantSchema, toIsoString } from '@core/infrastructure/http/dto/wire';
import { collect } from '@core/infrastructure/shared/results';
import {
  documentSchema,
  toDocument,
  toDocumentWire,
} from '@features/documents/infrastructure/dto/documentDto';
import { createAgendaItem } from '@features/meetings/domain/entities/AgendaItem';
import type { AgendaItem } from '@features/meetings/domain/entities/AgendaItem';
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

// The meetings of the API: `GET /meetings` (a page of summaries) and `GET /meetings/{id}`.
//
// A schema checks that each field is there and has the type of the API, and ignores the fields it
// does not know. The values themselves are checked by the factories of the domain, in the mappers:
// a status that is not one, a blank title, a duplicate id. An instant is an ISO 8601 string.

const resolutionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  closesAt: isoInstantSchema.optional(),
  recordedVote: z.string().optional(),
});

const agendaItemSchema = z.object({
  id: z.string(),
  position: z.number(),
  title: z.string(),
  description: z.string().optional(),
  resolution: resolutionSchema.optional(),
});

const participantSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  role: z.string(),
});

export const meetingSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  scheduledAt: isoInstantSchema,
  location: z.string(),
});

export const meetingSchema = meetingSummarySchema.extend({
  agenda: z.array(agendaItemSchema),
  documents: z.array(documentSchema),
  participants: z.array(participantSchema),
});

export const meetingPageSchema = z.object({
  items: z.array(meetingSummarySchema),
  nextCursor: z.string().optional(),
});

export type MeetingSummaryWire = z.input<typeof meetingSummarySchema>;
export type MeetingWire = z.input<typeof meetingSchema>;
export type MeetingPageWire = z.input<typeof meetingPageSchema>;

export function toMeetingSummary(
  wire: z.output<typeof meetingSummarySchema>,
): Result<MeetingSummary, ValidationError> {
  return andThen(parseMeetingId(wire.id), (id) =>
    andThen(parseInstant(wire.scheduledAt), (scheduledAt) =>
      createMeetingSummary({ id, title: wire.title, scheduledAt, location: wire.location }),
    ),
  );
}

function toResolution(
  wire: z.output<typeof resolutionSchema>,
): Result<Resolution, ValidationError> {
  return andThen(parseResolutionId(wire.id), (id) =>
    andThen(parseResolutionStatus(wire.status), (status) =>
      andThen(optional(wire.closesAt, parseInstant), (closesAt) =>
        andThen(optional(wire.recordedVote, parseVoteChoice), (recordedVote) =>
          createResolution({
            id,
            title: wire.title,
            description: wire.description,
            status,
            ...(closesAt === undefined ? {} : { closesAt }),
            ...(recordedVote === undefined ? {} : { recordedVote }),
          }),
        ),
      ),
    ),
  );
}

function toAgendaItem(
  wire: z.output<typeof agendaItemSchema>,
): Result<AgendaItem, ValidationError> {
  return andThen(parseAgendaItemId(wire.id), (id) =>
    andThen(optional(wire.resolution, toResolution), (resolution) =>
      createAgendaItem({
        id,
        position: wire.position,
        title: wire.title,
        ...(wire.description === undefined ? {} : { description: wire.description }),
        ...(resolution === undefined ? {} : { resolution }),
      }),
    ),
  );
}

function toParticipant(
  wire: z.output<typeof participantSchema>,
): Result<Participant, ValidationError> {
  return andThen(parseUserId(wire.userId), (userId) =>
    andThen(parseParticipantRole(wire.role), (role) =>
      createParticipant({ userId, fullName: wire.fullName, role }),
    ),
  );
}

/** The result of `read` on a value that may be missing: a missing value is a success, with nothing. */
function optional<W, T, E>(
  wire: W | undefined,
  read: (value: W) => Result<T, E>,
): Result<T | undefined, E> {
  return wire === undefined ? ok(undefined) : read(wire);
}

export function toMeeting(wire: z.output<typeof meetingSchema>): Result<Meeting, ValidationError> {
  return andThen(toMeetingSummary(wire), (summary) =>
    andThen(collect(wire.agenda.map(toAgendaItem)), (agenda) =>
      andThen(collect(wire.documents.map(toDocument)), (documents) =>
        andThen(collect(wire.participants.map(toParticipant)), (participants) =>
          createMeeting({ summary, agenda, documents, participants }),
        ),
      ),
    ),
  );
}

export function toMeetingPage(
  wire: z.output<typeof meetingPageSchema>,
): Result<Page<MeetingSummary>, ValidationError> {
  return andThen(collect(wire.items.map(toMeetingSummary)), (items) =>
    andThen(optional(wire.nextCursor, parsePageCursor), (nextCursor) =>
      ok(createPage(items, nextCursor)),
    ),
  );
}

export function toMeetingSummaryWire(summary: MeetingSummary): MeetingSummaryWire {
  return {
    id: summary.id,
    title: summary.title,
    scheduledAt: toIsoString(summary.scheduledAt),
    location: summary.location,
  };
}

function toResolutionWire(resolution: Resolution): z.input<typeof resolutionSchema> {
  return {
    id: resolution.id,
    title: resolution.title,
    description: resolution.description,
    status: resolution.status,
    ...(resolution.closesAt === undefined ? {} : { closesAt: toIsoString(resolution.closesAt) }),
    ...(resolution.recordedVote === undefined ? {} : { recordedVote: resolution.recordedVote }),
  };
}

function toAgendaItemWire(item: AgendaItem): z.input<typeof agendaItemSchema> {
  return {
    id: item.id,
    position: item.position,
    title: item.title,
    ...(item.description === undefined ? {} : { description: item.description }),
    ...(item.resolution === undefined ? {} : { resolution: toResolutionWire(item.resolution) }),
  };
}

export function toMeetingWire(meeting: Meeting): MeetingWire {
  return {
    ...toMeetingSummaryWire(meeting),
    agenda: meeting.agenda.map(toAgendaItemWire),
    documents: meeting.documents.map(toDocumentWire),
    participants: meeting.participants.map((participant) => ({
      userId: participant.userId,
      fullName: participant.fullName,
      role: participant.role,
    })),
  };
}

export function toMeetingPageWire(page: Page<MeetingSummary>): MeetingPageWire {
  return {
    items: page.items.map(toMeetingSummaryWire),
    ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
  };
}
