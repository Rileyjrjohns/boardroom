import { VALIDATION_FIELD, VALIDATION_RULE, validationError } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { andThen, err, ok } from '../shared/Result';
import type { Result } from '../shared/Result';
import { isWellFormedText, requireText } from '../shared/validation';

const MAX_CURSOR_LENGTH = 512;

/**
 * Where the next page starts. Opaque: the remote source builds it, the app hands it back
 * unchanged. Nothing may be inferred from its content, except that it is well-formed UTF-16: it is
 * put in a URL, and a lone surrogate cannot be encoded.
 */
export type PageCursor = Brand<string, 'PageCursor'>;

export function parsePageCursor(raw: string): Result<PageCursor, ValidationError> {
  return andThen(requireText(VALIDATION_FIELD.PageCursor, raw, MAX_CURSOR_LENGTH), (cursor) =>
    isWellFormedText(cursor)
      ? ok(cursor as PageCursor)
      : err(validationError(VALIDATION_FIELD.PageCursor, VALIDATION_RULE.InvalidFormat)),
  );
}
