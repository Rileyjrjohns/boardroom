import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { hasDuplicates } from '../shared/validation';
import type { ResolutionId, UserId } from '../value-objects/ids';

import type { AgendaItem } from './AgendaItem';
import type { Document } from './Document';
import type { MeetingSummary } from './MeetingSummary';
import type { Participant } from './Participant';
import type { Resolution } from './Resolution';
import type { Vote } from './Vote';

/** A meeting with everything its detail screen shows. */
export interface Meeting extends MeetingSummary {
  /** Sorted by position. */
  readonly agenda: readonly AgendaItem[];
  readonly documents: readonly Document[];
  readonly participants: readonly Participant[];
}

export interface MeetingInput {
  readonly summary: MeetingSummary;
  readonly agenda: readonly AgendaItem[];
  readonly documents: readonly Document[];
  readonly participants: readonly Participant[];
}

/**
 * Builds a meeting. Within a meeting, agenda items must have distinct ids and positions,
 * resolutions distinct ids, documents distinct ids, participants distinct user ids. The agenda is
 * sorted by position. The collections are copied.
 */
export function createMeeting(input: MeetingInput): Result<Meeting, ValidationError> {
  const { summary, agenda, documents, participants } = input;
  const resolutionIds = agenda.flatMap((item) =>
    item.resolution === undefined ? [] : [item.resolution.id],
  );

  if (
    hasDuplicates(agenda.map((item) => item.id)) ||
    hasDuplicates(agenda.map((item) => item.position)) ||
    hasDuplicates(resolutionIds)
  ) {
    return err(validationError(VALIDATION_FIELD.Agenda, VALIDATION_RULE.Duplicate));
  }
  if (hasDuplicates(documents.map((document) => document.id))) {
    return err(validationError(VALIDATION_FIELD.Documents, VALIDATION_RULE.Duplicate));
  }
  if (hasDuplicates(participants.map((participant) => participant.userId))) {
    return err(validationError(VALIDATION_FIELD.Participants, VALIDATION_RULE.Duplicate));
  }

  return ok({
    ...summary,
    agenda: [...agenda].sort((first, second) => first.position - second.position),
    documents: [...documents],
    participants: [...participants],
  });
}

/** The resolution with this id, wherever it sits in the agenda. */
export function findResolution(
  meeting: Meeting,
  resolutionId: ResolutionId,
): Resolution | undefined {
  return meeting.agenda.find((item) => item.resolution?.id === resolutionId)?.resolution;
}

export function findParticipant(meeting: Meeting, userId: UserId): Participant | undefined {
  return meeting.participants.find((participant) => participant.userId === userId);
}

/**
 * A copy of the meeting in which the vote is recorded on its resolution, as the server records it
 * once the vote is accepted. Used to keep a cached copy truthful, so that the voter cannot vote
 * again from it. The meeting is returned unchanged when the vote belongs to another meeting or to a
 * resolution it does not have.
 */
export function withVoteRecorded(meeting: Meeting, vote: Vote): Meeting {
  if (vote.meetingId !== meeting.id) return meeting;
  return {
    ...meeting,
    agenda: meeting.agenda.map((item) =>
      item.resolution?.id === vote.resolutionId
        ? { ...item, resolution: { ...item.resolution, recordedVote: vote.choice } }
        : item,
    ),
  };
}
