import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';
import { aParticipant, aUserId } from '../testing/builders';

import {
  PARTICIPANT_ROLE,
  createParticipant,
  hasVotingRights,
  parseParticipantRole,
} from './Participant';

describe('createParticipant', () => {
  it('builds a participant with a trimmed name', () => {
    expect(
      createParticipant({
        userId: aUserId(),
        fullName: ' Alice Martin ',
        role: PARTICIPANT_ROLE.Chair,
      }),
    ).toEqual(ok({ userId: aUserId(), fullName: 'Alice Martin', role: PARTICIPANT_ROLE.Chair }));
  });

  it('rejects a blank name', () => {
    expect(
      createParticipant({ userId: aUserId(), fullName: '', role: PARTICIPANT_ROLE.Member }),
    ).toEqual(err(validationError(VALIDATION_FIELD.FullName, VALIDATION_RULE.Required)));
  });
});

describe('hasVotingRights', () => {
  it.each([
    [PARTICIPANT_ROLE.Chair, true],
    [PARTICIPANT_ROLE.Member, true],
    [PARTICIPANT_ROLE.Secretary, false],
    [PARTICIPANT_ROLE.Guest, false],
  ])('is decided by the role: %s -> %s', (role, expected) => {
    expect(hasVotingRights(aParticipant({ role }))).toBe(expected);
  });
});

describe('parseParticipantRole', () => {
  it.each(Object.values(PARTICIPANT_ROLE))('parses %s', (role) => {
    expect(parseParticipantRole(role)).toEqual(ok(role));
  });

  it('rejects an unknown role', () => {
    expect(parseParticipantRole('owner')).toEqual(
      err(validationError(VALIDATION_FIELD.ParticipantRole, VALIDATION_RULE.UnknownValue)),
    );
  });
});
