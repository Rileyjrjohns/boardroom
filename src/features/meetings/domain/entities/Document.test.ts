import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';
import { aConfidentialDocument, aDocument, aDocumentId } from '@testing/domain/builders';

import {
  CONFIDENTIALITY_LEVEL,
  createDocument,
  isConfidential,
  parseConfidentialityLevel,
} from './Document';

const VALID = {
  id: aDocumentId(),
  title: 'Financial statements',
  confidentiality: CONFIDENTIALITY_LEVEL.Internal,
  pageCount: 12,
};

describe('createDocument', () => {
  it('builds a document with a trimmed title', () => {
    expect(createDocument({ ...VALID, title: '  Financial statements ' })).toEqual(ok(VALID));
  });

  it('rejects a blank title', () => {
    expect(createDocument({ ...VALID, title: '' })).toEqual(
      err(validationError(VALIDATION_FIELD.Title, VALIDATION_RULE.Required)),
    );
  });

  it.each([
    [0, VALIDATION_RULE.OutOfRange],
    [10_001, VALIDATION_RULE.OutOfRange],
    [1.5, VALIDATION_RULE.NotAnInteger],
  ])('rejects the page count %p', (pageCount, rule) => {
    expect(createDocument({ ...VALID, pageCount })).toEqual(
      err(validationError(VALIDATION_FIELD.PageCount, rule)),
    );
  });
});

describe('isConfidential', () => {
  it('is true for a confidential document only', () => {
    expect(isConfidential(aConfidentialDocument())).toBe(true);
    expect(isConfidential(aDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Internal }))).toBe(
      false,
    );
    expect(isConfidential(aDocument({ confidentiality: CONFIDENTIALITY_LEVEL.Public }))).toBe(
      false,
    );
  });
});

describe('parseConfidentialityLevel', () => {
  it.each(Object.values(CONFIDENTIALITY_LEVEL))('parses %s', (level) => {
    expect(parseConfidentialityLevel(level)).toEqual(ok(level));
  });

  it('rejects an unknown level', () => {
    expect(parseConfidentialityLevel('secret')).toEqual(
      err(validationError(VALIDATION_FIELD.ConfidentialityLevel, VALIDATION_RULE.UnknownValue)),
    );
  });
});
