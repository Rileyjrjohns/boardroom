import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';

import { VOTE_CHOICE, parseVoteChoice } from './VoteChoice';

describe('VoteChoice', () => {
  it('has three choices', () => {
    expect(Object.values(VOTE_CHOICE)).toEqual(['for', 'against', 'abstain']);
  });

  it.each(Object.values(VOTE_CHOICE))('parses %s', (choice) => {
    expect(parseVoteChoice(choice)).toEqual(ok(choice));
  });

  it.each(['', 'FOR', 'yes', ' for', 'forward', 'fo', 'against!', 'abstainer'])(
    'rejects %j',
    (raw) => {
      expect(parseVoteChoice(raw)).toEqual(
        err(validationError(VALIDATION_FIELD.VoteChoice, VALIDATION_RULE.UnknownValue)),
      );
    },
  );
});
