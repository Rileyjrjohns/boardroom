/**
 * The outcome of an operation that can fail. Every fallible operation of the domain and of the
 * application returns a `Result` (or a `Promise<Result>`): no exception crosses a layer. The error
 * side is a discriminated union of plain data, never a thrown value and never a user-facing text.
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Transforms the value of a success; a failure is returned as is. */
export function map<T, U, E>(result: Result<T, E>, transform: (value: T) => U): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

/** Chains a step that can fail on a success; a failure short-circuits and is returned as is. */
export function andThen<T, U, E, F>(
  result: Result<T, E>,
  next: (value: T) => Result<U, F>,
): Result<U, E | F> {
  return result.ok ? next(result.value) : result;
}

/**
 * `andThen` for an asynchronous step. It also accepts the promise of the first result, so that a
 * port call can be chained without an intermediate `await` and `if`:
 *
 *   andThenAsync(gate.checkAvailability(), () => gate.authenticate(reason))
 */
export async function andThenAsync<T, U, E, F>(
  result: Result<T, E> | Promise<Result<T, E>>,
  next: (value: T) => Promise<Result<U, F>>,
): Promise<Result<U, E | F>> {
  const settled = await result;
  return settled.ok ? next(settled.value) : settled;
}
