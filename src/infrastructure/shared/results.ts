import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

/**
 * Turns a list of results into the result of the list: the values in order, or the first failure.
 * For mapping the members of a collection through the factories of the domain.
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return err(result.error);
    values.push(result.value);
  }
  return ok(values);
}
