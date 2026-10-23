import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import type { ValidationError } from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { findConstant, valuesOf } from '@core/domain/shared/constants';
import type { ValueOf } from '@core/domain/shared/constants';

export const VOTE_CHOICE = {
  For: 'for',
  Against: 'against',
  Abstain: 'abstain',
} as const;

export type VoteChoice = ValueOf<typeof VOTE_CHOICE>;

export function parseVoteChoice(raw: string): Result<VoteChoice, ValidationError> {
  const choice = findConstant(valuesOf(VOTE_CHOICE), raw);
  return choice === undefined
    ? err(validationError(VALIDATION_FIELD.VoteChoice, VALIDATION_RULE.UnknownValue))
    : ok(choice);
}
