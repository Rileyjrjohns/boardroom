import { VALIDATION_FIELD } from '../errors/ValidationError';
import type { ValidationError } from '../errors/ValidationError';
import { map } from '../shared/Result';
import type { Result } from '../shared/Result';
import { requireIntegerInRange } from '../shared/validation';

import type { PageCursor } from './PageCursor';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

/** Which page to read: after `cursor` (the first page when absent), at most `limit` items. */
export interface PageRequest {
  readonly cursor?: PageCursor;
  readonly limit: number;
}

export interface PageRequestInput {
  readonly cursor?: PageCursor;
  /** Between 1 and `MAX_PAGE_LIMIT`. `DEFAULT_PAGE_LIMIT` when absent. */
  readonly limit?: number;
}

export function createPageRequest(
  input: PageRequestInput = {},
): Result<PageRequest, ValidationError> {
  const { cursor, limit = DEFAULT_PAGE_LIMIT } = input;
  return map(
    requireIntegerInRange(VALIDATION_FIELD.PageLimit, limit, 1, MAX_PAGE_LIMIT),
    (validLimit) => (cursor === undefined ? { limit: validLimit } : { cursor, limit: validLimit }),
  );
}
