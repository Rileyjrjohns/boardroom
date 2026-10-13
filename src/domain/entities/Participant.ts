import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { findConstant, valuesOf } from '../shared/constants';
import type { ValueOf } from '../shared/constants';
import { err, map, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireText } from '../shared/validation';
import type { UserId } from '../value-objects/ids';

import { MAX_FULL_NAME_LENGTH } from './User';

export const PARTICIPANT_ROLE = {
  Chair: 'chair',
  Secretary: 'secretary',
  Member: 'member',
  Guest: 'guest',
} as const;

export type ParticipantRole = ValueOf<typeof PARTICIPANT_ROLE>;

/** The roles that carry a vote. A secretary takes the minutes and a guest attends: neither votes. */
const VOTING_ROLES: readonly ParticipantRole[] = [PARTICIPANT_ROLE.Chair, PARTICIPANT_ROLE.Member];

export function parseParticipantRole(raw: string): Result<ParticipantRole, ValidationError> {
  const role = findConstant(valuesOf(PARTICIPANT_ROLE), raw);
  return role === undefined
    ? err(validationError(VALIDATION_FIELD.ParticipantRole, VALIDATION_RULE.UnknownValue))
    : ok(role);
}

/** A person invited to a meeting, in a given role. */
export interface Participant {
  readonly userId: UserId;
  readonly fullName: string;
  readonly role: ParticipantRole;
}

export interface ParticipantInput {
  readonly userId: UserId;
  readonly fullName: string;
  readonly role: ParticipantRole;
}

export function createParticipant(input: ParticipantInput): Result<Participant, ValidationError> {
  return map(
    requireText(VALIDATION_FIELD.FullName, input.fullName, MAX_FULL_NAME_LENGTH),
    (fullName) => ({ userId: input.userId, fullName, role: input.role }),
  );
}

export function hasVotingRights(participant: Participant): boolean {
  return VOTING_ROLES.includes(participant.role);
}
