import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { andThen, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireText } from '../shared/validation';
import type { MeetingId } from '../value-objects/ids';
import type { Instant } from '../value-objects/Instant';

import { MAX_TITLE_LENGTH } from './Document';

const MAX_LOCATION_LENGTH = 300;

/** What a list of meetings shows about a meeting. */
export interface MeetingSummary {
  readonly id: MeetingId;
  readonly title: string;
  readonly scheduledAt: Instant;
  /** Where it takes place: a room, an address, a video call. Free text. */
  readonly location: string;
}

export interface MeetingSummaryInput {
  readonly id: MeetingId;
  readonly title: string;
  readonly scheduledAt: Instant;
  readonly location: string;
}

export function createMeetingSummary(
  input: MeetingSummaryInput,
): Result<MeetingSummary, ValidationError> {
  return andThen(requireText(VALIDATION_FIELD.Title, input.title, MAX_TITLE_LENGTH), (title) =>
    andThen(
      requireText(VALIDATION_FIELD.Location, input.location, MAX_LOCATION_LENGTH),
      (location) => ok({ id: input.id, title, scheduledAt: input.scheduledAt, location }),
    ),
  );
}
