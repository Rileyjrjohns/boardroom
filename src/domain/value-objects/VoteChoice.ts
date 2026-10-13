import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { findConstant, valuesOf } from '../shared/constants';
import type { ValueOf } from '../shared/constants';
import { err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';

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
