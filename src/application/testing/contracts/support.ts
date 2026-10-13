import type { Result } from '@domain/shared/Result';

// Support of the contract suites, which are test code: they run against the fakes of the
// application and against the real adapters, and they only use the public surface of the ports.

/** The same type with the `readonly` of its properties removed. */
type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

/**
 * Lets a test write through the `readonly` of a value, the way a careless caller could with a
 * cast. The no-aliasing checks use it to prove that a store keeps no reference to what it was
 * given, nor hands out one it keeps.
 */
export function mutable<T>(value: T): Mutable<T> {
  return value as Mutable<T>;
}

/** The same, for a `readonly` array. */
export function mutableArray<T>(value: readonly T[]): T[] {
  return value as T[];
}

/** What a successful result holds, for a test that cannot go on without it. */
export function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Expected a success, got ${JSON.stringify(result.error)}`);
  return result.value;
}
