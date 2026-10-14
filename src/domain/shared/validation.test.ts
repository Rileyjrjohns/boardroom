import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';

import { err, ok } from './Result';
import {
  hasDuplicates,
  isWellFormedText,
  optionalText,
  requireIntegerInRange,
  requireText,
} from './validation';

const FIELD = VALIDATION_FIELD.Title;

describe('requireText', () => {
  it('returns the trimmed text', () => {
    expect(requireText(FIELD, '  Budget  ', 10)).toEqual(ok('Budget'));
  });

  it.each(['', '   ', '\n\t'])('rejects the blank text %j', (raw) => {
    expect(requireText(FIELD, raw, 10)).toEqual(
      err(validationError(FIELD, VALIDATION_RULE.Required)),
    );
  });

  it('accepts a text of exactly the maximum length and rejects a longer one', () => {
    expect(requireText(FIELD, 'a'.repeat(10), 10)).toEqual(ok('a'.repeat(10)));
    expect(requireText(FIELD, 'a'.repeat(11), 10)).toEqual(
      err(validationError(FIELD, VALIDATION_RULE.TooLong)),
    );
  });

  it('measures the length after trimming', () => {
    expect(requireText(FIELD, `  ${'a'.repeat(10)}  `, 10)).toEqual(ok('a'.repeat(10)));
  });
});

describe('optionalText', () => {
  it.each([undefined, '', '   '])('treats %j as no text', (raw) => {
    expect(optionalText(FIELD, raw, 10)).toEqual(ok(undefined));
  });

  it('validates a text that is present', () => {
    expect(optionalText(FIELD, ' Notes ', 10)).toEqual(ok('Notes'));
    expect(optionalText(FIELD, 'a'.repeat(11), 10)).toEqual(
      err(validationError(FIELD, VALIDATION_RULE.TooLong)),
    );
  });
});

describe('requireIntegerInRange', () => {
  it('accepts the bounds and what lies between', () => {
    expect(requireIntegerInRange(FIELD, 1, 1, 5)).toEqual(ok(1));
    expect(requireIntegerInRange(FIELD, 5, 1, 5)).toEqual(ok(5));
  });

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p as not an integer', (value) => {
    expect(requireIntegerInRange(FIELD, value, 1, 5)).toEqual(
      err(validationError(FIELD, VALIDATION_RULE.NotAnInteger)),
    );
  });

  it.each([0, 6, -1])('rejects %p as out of range', (value) => {
    expect(requireIntegerInRange(FIELD, value, 1, 5)).toEqual(
      err(validationError(FIELD, VALIDATION_RULE.OutOfRange)),
    );
  });
});

describe('hasDuplicates', () => {
  it('detects a repeated key', () => {
    expect(hasDuplicates(['a', 'b', 'a'])).toBe(true);
    expect(hasDuplicates([1, 2, 1])).toBe(true);
  });

  it('accepts distinct keys and an empty list', () => {
    expect(hasDuplicates(['a', 'b'])).toBe(false);
    expect(hasDuplicates([])).toBe(false);
  });
});

describe('isWellFormedText', () => {
  it.each(['', 'abc', 'caf\u00e9', 'cafe\u0301', '\u{1F600}', 'a\u{1F600}b', '\ud83d\ude00'])(
    'accepts %j',
    (text) => {
      expect(isWellFormedText(text)).toBe(true);
    },
  );

  it.each([
    '\ud800',
    '\udbff',
    '\udc00',
    '\udfff',
    'a\ud800',
    '\ud800a',
    '\udc00\ud800',
    '\ud800\ud800\udc00',
    '\ud83d\ude00\ud83d',
  ])('rejects %j', (text) => {
    expect(isWellFormedText(text)).toBe(false);
  });
});
