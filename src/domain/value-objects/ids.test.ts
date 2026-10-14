import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import { err, ok } from '../shared/Result';

import {
  parseAgendaItemId,
  parseDocumentId,
  parseMeetingId,
  parseResolutionId,
  parseUserId,
} from './ids';

const PARSERS = [
  ['user id', parseUserId, VALIDATION_FIELD.UserId],
  ['meeting id', parseMeetingId, VALIDATION_FIELD.MeetingId],
  ['agenda item id', parseAgendaItemId, VALIDATION_FIELD.AgendaItemId],
  ['resolution id', parseResolutionId, VALIDATION_FIELD.ResolutionId],
  ['document id', parseDocumentId, VALIDATION_FIELD.DocumentId],
] as const;

describe.each(PARSERS)('the %s', (_name, parse, field) => {
  it('is kept exactly as received', () => {
    expect(parse('a1-B2_c3')).toEqual(ok('a1-B2_c3'));
    expect(parse(' padded ')).toEqual(ok(' padded '));
  });

  it.each(['', '   '])('rejects the blank id %j and names the field', (raw) => {
    expect(parse(raw)).toEqual(err(validationError(field, VALIDATION_RULE.Required)));
  });

  it.each([
    ['a lone high surrogate', '\ud800'],
    ['a lone low surrogate', '\udc00'],
    ['a high surrogate at the end', 'abc\ud83d'],
    ['a low surrogate before its high one', '\ude00\ud83d'],
    ['a high surrogate followed by a letter', '\ud83dx'],
  ])('rejects %s: the text cannot be encoded', (_name, raw) => {
    expect(parse(raw)).toEqual(err(validationError(field, VALIDATION_RULE.InvalidFormat)));
  });

  it('accepts a character outside the basic plane, written as a pair of surrogates', () => {
    expect(parse('a\u{1F600}b')).toEqual(ok('a\u{1F600}b'));
  });

  it.each(['.', '..'])('rejects %j, which a path would read as a directory', (raw) => {
    expect(parse(raw)).toEqual(err(validationError(field, VALIDATION_RULE.InvalidFormat)));
  });

  it.each(['...', '.a', 'a.', 'a..b', ' . '])(
    'accepts %j, which is not a directory name',
    (raw) => {
      expect(parse(raw)).toEqual(ok(raw));
    },
  );

  it('accepts 128 characters and rejects 129', () => {
    expect(parse('a'.repeat(128))).toEqual(ok('a'.repeat(128)));
    expect(parse('a'.repeat(129))).toEqual(err(validationError(field, VALIDATION_RULE.TooLong)));
  });
});
