import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';
import { NOW, aResolutionId, unwrap } from '../testing/builders';
import { VOTE_CHOICE } from '../value-objects/VoteChoice';

import { RESOLUTION_STATUS, createResolution, parseResolutionStatus } from './Resolution';

const VALID = {
  id: aResolutionId(),
  title: 'Approve the budget',
  description: 'Approve the budget of the next financial year.',
  status: RESOLUTION_STATUS.Open,
};

describe('createResolution', () => {
  it('builds a resolution without closing instant nor recorded vote', () => {
    const resolution = unwrap(createResolution(VALID));

    expect(resolution).toEqual(VALID);
    expect(resolution).not.toHaveProperty('closesAt');
    expect(resolution).not.toHaveProperty('recordedVote');
  });

  it('keeps the closing instant and the recorded vote when given', () => {
    expect(
      createResolution({ ...VALID, closesAt: NOW, recordedVote: VOTE_CHOICE.Abstain }),
    ).toEqual(ok({ ...VALID, closesAt: NOW, recordedVote: VOTE_CHOICE.Abstain }));
  });

  it('trims the texts', () => {
    expect(createResolution({ ...VALID, title: ' T ', description: ' D ' })).toEqual(
      ok({ ...VALID, title: 'T', description: 'D' }),
    );
  });

  it('rejects a blank title, then a blank description', () => {
    expect(createResolution({ ...VALID, title: ' ', description: ' ' })).toEqual(
      err(validationError(VALIDATION_FIELD.Title, VALIDATION_RULE.Required)),
    );
    expect(createResolution({ ...VALID, description: ' ' })).toEqual(
      err(validationError(VALIDATION_FIELD.Description, VALIDATION_RULE.Required)),
    );
  });
});

describe('parseResolutionStatus', () => {
  it.each(Object.values(RESOLUTION_STATUS))('parses %s', (status) => {
    expect(parseResolutionStatus(status)).toEqual(ok(status));
  });

  it('rejects an unknown status', () => {
    expect(parseResolutionStatus('draft')).toEqual(
      err(validationError(VALIDATION_FIELD.ResolutionStatus, VALIDATION_RULE.UnknownValue)),
    );
  });
});
