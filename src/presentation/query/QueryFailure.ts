import { unexpected } from '@domain/errors/RepositoryError';
import type { UnexpectedError } from '@domain/errors/RepositoryError';
import { isErr } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

/** What every error of the application looks like: plain data with a `code`. */
export interface CodedError {
  readonly code: string;
}

/**
 * The failure of a use case, as TanStack Query sees it: the error `Result`, wrapped in a thrown
 * value so that the query goes to its error state.
 *
 * THE CONVENTION for turning a `Result` into query state. A use case returns a `Result`; a query
 * function must either return data or throw. Two ways to bridge them were considered:
 *
 * 1. Return the `Result` as the data of the query, and branch on `result.ok` in every component.
 *    Rejected. The query would be "successful" whatever the use case said, so `isError`, `error`,
 *    the retry and the error boundaries of the library would never see a failure. Worse, for an
 *    infinite list a failed page would be one more "successful" page, and a failed refresh would
 *    replace the data on the screen with the error instead of keeping it next to the error.
 * 2. Throw a `QueryFailure` that wraps the error, and let the library carry it. Chosen. A failed
 *    query keeps the data it had (`data` and `error` are set together), `isError` and
 *    `isFetchNextPageError` mean what they say, the retry can look at the error, and the screens
 *    read a typed `error.error` whose `code` is one of the codes of the domain.
 *
 * `unwrapResult` is the only place where a `Result` is thrown, and `isQueryFailure` the only place
 * where it is recognised again. No exception leaves the presentation: TanStack Query catches it.
 *
 * MUTATIONS follow the same convention, through `useResultMutation` (sign in, unlock, sign out,
 * vote, acknowledge): the mutation function awaits the use case and unwraps its `Result`, so a
 * failure is a thrown `QueryFailure` and the mutation goes to its error state, whose `error` is
 * typed with the errors of that use case. Business errors are not retried (a mutation acts, and
 * doing it again is for the user to decide), and a failure that ends the session ends it from the
 * mutation cache exactly as from the query cache (see `createQueryClient`). `failureOf` reads the
 * typed error back, and any rejection that is not a `QueryFailure` is `unexpected`.
 */
export class QueryFailure<E extends CodedError> extends Error {
  constructor(readonly error: E) {
    super(error.code);
    // Keeps `instanceof` working when the class is compiled down to a function.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** The data of a success. A failure is thrown as a `QueryFailure`, for the query to catch. */
export function unwrapResult<T, E extends CodedError>(result: Result<T, E>): T {
  if (isErr(result)) throw new QueryFailure(result.error);
  return result.value;
}

export function isQueryFailure(value: unknown): value is QueryFailure<CodedError> {
  return value instanceof QueryFailure;
}

/**
 * The typed failure a mutation ended with. `E` is the union of errors of the use case the mutation
 * calls: it is what the hook declared, not something that can be checked here, so a rejection that
 * is not a `QueryFailure` (a bug) is `unexpected` instead of being trusted.
 */
export function failureOf<E extends CodedError>(error: unknown): E | UnexpectedError {
  return isQueryFailure(error) ? (error.error as E) : unexpected();
}
