import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import type { Brand } from '../shared/Brand';
import { map } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireText } from '../shared/validation';

const MAX_CURSOR_LENGTH = 512;

/**
 * Where the next page starts. Opaque: the remote source builds it, the app hands it back
 * unchanged. Nothing may be inferred from its content.
 */
export type PageCursor = Brand<string, 'PageCursor'>;

export function parsePageCursor(raw: string): Result<PageCursor, ValidationError> {
  return map(
    requireText(VALIDATION_FIELD.PageCursor, raw, MAX_CURSOR_LENGTH),
    (cursor) => cursor as PageCursor,
  );
}
