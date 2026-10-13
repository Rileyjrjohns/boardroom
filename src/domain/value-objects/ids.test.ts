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

  it('accepts 128 characters and rejects 129', () => {
    expect(parse('a'.repeat(128))).toEqual(ok('a'.repeat(128)));
    expect(parse('a'.repeat(129))).toEqual(err(validationError(field, VALIDATION_RULE.TooLong)));
  });
});
