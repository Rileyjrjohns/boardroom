import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';

import type { ErrorCatalog } from '../errors/ErrorCatalog';

import { isQueryFailure } from './QueryFailure';

/**
 * The code that says why a query failed, from whatever it rejected with. A query function throws
 * a `QueryFailure`, but nothing stops a bug from rejecting with something else (an `Error`, a
 * string, `undefined`), and a screen must not crash on it: anything that is not the failure of a
 * use case, or whose code no screen has a text for (the `catalog` says), is `unexpected`. This is
 * the only place that reads the code of a rejection; the retry policy, the screens and the query
 * cache all go through it.
 */
export function errorCodeOf(error: unknown, catalog: ErrorCatalog): string {
  if (isQueryFailure(error) && catalog.has(error.error.code)) return error.error.code;
  return REPOSITORY_ERROR_CODE.Unexpected;
}
