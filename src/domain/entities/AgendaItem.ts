import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { andThen, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { optionalText, requireIntegerInRange, requireText } from '../shared/validation';
import type { AgendaItemId } from '../value-objects/ids';

import { MAX_TITLE_LENGTH } from './Document';
import { MAX_DESCRIPTION_LENGTH } from './Resolution';
import type { Resolution } from './Resolution';

const MAX_AGENDA_POSITION = 1000;

/** One point of the agenda of a meeting, possibly submitted to a vote. */
export interface AgendaItem {
  readonly id: AgendaItemId;
  /** Order in the agenda, starting at 1. */
  readonly position: number;
  readonly title: string;
  readonly description?: string;
  readonly resolution?: Resolution;
}

export interface AgendaItemInput {
  readonly id: AgendaItemId;
  /** A whole number between 1 and `MAX_AGENDA_POSITION`. */
  readonly position: number;
  readonly title: string;
  /** A blank description is no description. */
  readonly description?: string;
  readonly resolution?: Resolution;
}

export function createAgendaItem(input: AgendaItemInput): Result<AgendaItem, ValidationError> {
  const { id, resolution } = input;
  return andThen(
    requireIntegerInRange(VALIDATION_FIELD.Position, input.position, 1, MAX_AGENDA_POSITION),
    (position) =>
      andThen(requireText(VALIDATION_FIELD.Title, input.title, MAX_TITLE_LENGTH), (title) =>
        andThen(
          optionalText(VALIDATION_FIELD.Description, input.description, MAX_DESCRIPTION_LENGTH),
          (description) =>
            ok({
              id,
              position,
              title,
              ...(description === undefined ? {} : { description }),
              ...(resolution === undefined ? {} : { resolution }),
            }),
        ),
      ),
  );
}
