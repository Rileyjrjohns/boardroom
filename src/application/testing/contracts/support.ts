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

/**
 * Identifiers that break a key built by joining the parts with a separator, or by normalising
 * them: separators, quotes, a backslash, other case, surrounding spaces, and the same letter
 * written as one code point or as two. The pairs are chosen so that joining two of them with a
 * separator gives the same text for two different pairs (`a|b` + `c`, and `a` + `b|c`), including the
 * pairs that swallow the name of a period: `a|upcoming|b` + `c` and `a` + `b|upcoming|c`.
 */
export const TRICKY_IDS = [
  'a',
  'b',
  'a:b',
  'a|b',
  'b|c',
  'a/b',
  'a,b',
  'c',
  'b:c',
  'b/c',
  'b,c',
  'a|upcoming|b',
  'b|upcoming|c',
  '"',
  '\\',
  'a","b',
  'A',
  ' a',
  'a ',
  'caf\u00e9',
  'cafe\u0301',
] as const;

/**
 * What a store (a cache, the outbox) can be asked in its contract suite beyond what any store can.
 * A suite that cannot run a group because the implementation has nothing to fail or nothing to
 * reopen shows it as skipped, not as passed.
 */
export interface StoreContractOptions {
  /**
   * Whether the store sends statements to a storage that can fail (a database), and the harness
   * can make the next one fail (`failNextStatement`). A store in memory has no storage to fail.
   */
  readonly failsStatements: boolean;
  /**
   * Whether what was stored survives the store being closed and opened again on the same storage
   * (`reopen`). A store in memory has nothing to reopen.
   */
  readonly survivesReopen: boolean;
}

/** A store in memory: it has no storage that can fail, and nothing that survives being closed. */
export const IN_MEMORY_STORE: StoreContractOptions = {
  failsStatements: false,
  survivesReopen: false,
};
