import {
  VALIDATION_FIELD,
  VALIDATION_RULE,
  validationError,
} from '@core/domain/errors/ValidationError';
import { err, ok } from '@core/domain/shared/Result';

import { parseDocumentLocation } from './DocumentLocation';

describe('parseDocumentLocation', () => {
  it('keeps an opaque reference, trimmed', () => {
    expect(parseDocumentLocation(' file:///private/doc-1.pdf ')).toEqual(
      ok('file:///private/doc-1.pdf'),
    );
  });

  it('rejects a blank reference', () => {
    expect(parseDocumentLocation('  ')).toEqual(
      err(validationError(VALIDATION_FIELD.DocumentLocation, VALIDATION_RULE.Required)),
    );
  });

  it('rejects a reference longer than 2048 characters', () => {
    expect(parseDocumentLocation('a'.repeat(2049))).toEqual(
      err(validationError(VALIDATION_FIELD.DocumentLocation, VALIDATION_RULE.TooLong)),
    );
  });
});
