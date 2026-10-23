import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';

import { parseEmailAddress } from './EmailAddress';

describe('parseEmailAddress', () => {
  it('trims and lower-cases a valid address', () => {
    expect(parseEmailAddress('  Alice.Martin@Example.COM ')).toEqual(
      ok('alice.martin@example.com'),
    );
  });

  it.each(['a@b.co', 'first+tag@sub.example.org'])('accepts %s', (raw) => {
    expect(parseEmailAddress(raw)).toEqual(ok(raw));
  });

  it.each(['', '   '])('rejects the blank address %j as required', (raw) => {
    expect(parseEmailAddress(raw)).toEqual(
      err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.Required)),
    );
  });

  it.each(['alice', 'alice@', '@example.com', 'alice@example', 'a b@example.com', 'a@@b.com'])(
    'rejects %j as badly formed',
    (raw) => {
      expect(parseEmailAddress(raw)).toEqual(
        err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.InvalidFormat)),
      );
    },
  );

  it('rejects an address longer than 254 characters', () => {
    const tooLong = `${'a'.repeat(250)}@b.co`;

    expect(parseEmailAddress(tooLong)).toEqual(
      err(validationError(VALIDATION_FIELD.Email, VALIDATION_RULE.TooLong)),
    );
  });
});
