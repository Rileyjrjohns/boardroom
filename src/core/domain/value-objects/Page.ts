import type { PageCursor } from './PageCursor';

/** One page of a list. `nextCursor` is absent on the last page. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: PageCursor;
}

/** Builds a page. The items are copied, so the page does not share an array with its caller. */
export function createPage<T>(items: readonly T[], nextCursor?: PageCursor): Page<T> {
  return nextCursor === undefined ? { items: [...items] } : { items: [...items], nextCursor };
}
