import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { findConstant, valuesOf } from '../shared/constants';
import type { ValueOf } from '../shared/constants';
import { andThen, err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireText } from '../shared/validation';
import type { ResolutionId } from '../value-objects/ids';
import type { Instant } from '../value-objects/Instant';
import type { VoteChoice } from '../value-objects/VoteChoice';

import { MAX_TITLE_LENGTH } from './Document';

export const MAX_DESCRIPTION_LENGTH = 5000;

export const RESOLUTION_STATUS = {
  Open: 'open',
  Closed: 'closed',
} as const;

export type ResolutionStatus = ValueOf<typeof RESOLUTION_STATUS>;

export function parseResolutionStatus(raw: string): Result<ResolutionStatus, ValidationError> {
  const status = findConstant(valuesOf(RESOLUTION_STATUS), raw);
  return status === undefined
    ? err(validationError(VALIDATION_FIELD.ResolutionStatus, VALIDATION_RULE.UnknownValue))
    : ok(status);
}

/** A decision the board votes on. */
export interface Resolution {
  readonly id: ResolutionId;
  readonly title: string;
  readonly description: string;
  readonly status: ResolutionStatus;
  /** The end of the voting window. A resolution without one stays open until its status says otherwise. */
  readonly closesAt?: Instant;
  /** The vote the current user has already cast, as the remote source records it. Absent: none yet. */
  readonly recordedVote?: VoteChoice;
}

export interface ResolutionInput {
  readonly id: ResolutionId;
  readonly title: string;
  readonly description: string;
  readonly status: ResolutionStatus;
  readonly closesAt?: Instant;
  readonly recordedVote?: VoteChoice;
}

export function createResolution(input: ResolutionInput): Result<Resolution, ValidationError> {
  const { id, status, closesAt, recordedVote } = input;
  return andThen(requireText(VALIDATION_FIELD.Title, input.title, MAX_TITLE_LENGTH), (title) =>
    andThen(
      requireText(VALIDATION_FIELD.Description, input.description, MAX_DESCRIPTION_LENGTH),
      (description) =>
        ok({
          id,
          title,
          description,
          status,
          ...(closesAt === undefined ? {} : { closesAt }),
          ...(recordedVote === undefined ? {} : { recordedVote }),
        }),
    ),
  );
}
