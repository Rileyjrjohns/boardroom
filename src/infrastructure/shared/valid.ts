import type { Result } from '@domain/shared/Result';

/**
 * A value that is valid by construction turned out not to be: a constant, a seed, a clamped
 * reading. It is a programming error found by the first test that runs the code, never a runtime
 * condition, so it is thrown instead of returned. It stops at the first import of the module (a
 * configuration constant), or at the edge of the function that catches it. Data that comes from
 * outside, such as the fixtures, is never read with it: that is an error `Result` to return.
 */
export class InvalidStaticValueError extends Error {
  constructor(readonly detail: string) {
    super(`Invalid static value: ${detail}`);
  }
}

/**
 * The value of a success. For data written in the code itself, where a failure of a domain
 * factory means the data is wrong. Never use it on data that comes from outside: that is an error
 * `Result` to return.
 */
export function valid<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new InvalidStaticValueError(JSON.stringify(result.error));
  return result.value;
}
