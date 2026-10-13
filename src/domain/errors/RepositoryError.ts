export const REPOSITORY_ERROR_CODE = {
  NetworkUnavailable: 'networkUnavailable',
  NotFound: 'notFound',
  Unauthorized: 'unauthorized',
  Unexpected: 'unexpected',
} as const;

/** The remote source could not be reached. The only error that the offline policy recovers from. */
export interface NetworkUnavailableError {
  readonly code: typeof REPOSITORY_ERROR_CODE.NetworkUnavailable;
}

/** The remote source answered that the requested item does not exist. */
export interface NotFoundError {
  readonly code: typeof REPOSITORY_ERROR_CODE.NotFound;
}

/** The remote source refused the caller: no valid credentials, or not allowed to see the item. */
export interface UnauthorizedError {
  readonly code: typeof REPOSITORY_ERROR_CODE.Unauthorized;
}

/**
 * Anything else: a server fault, an answer that cannot be read. `cause` is a technical diagnostic
 * for the monitoring tools. It is never shown to the user, and it must never hold personal data or
 * the values of a query (an email, a name, an id in a URL): a status code and a kind of failure.
 */
export interface UnexpectedError {
  readonly code: typeof REPOSITORY_ERROR_CODE.Unexpected;
  readonly cause?: string;
}

/** What a remote call can fail with when it addresses no particular item (a listing). */
export type GatewayError = NetworkUnavailableError | UnauthorizedError | UnexpectedError;

/** What a remote call can fail with when it addresses one item. */
export type RepositoryError = GatewayError | NotFoundError;

export function networkUnavailable(): NetworkUnavailableError {
  return { code: REPOSITORY_ERROR_CODE.NetworkUnavailable };
}

export function notFound(): NotFoundError {
  return { code: REPOSITORY_ERROR_CODE.NotFound };
}

export function unauthorized(): UnauthorizedError {
  return { code: REPOSITORY_ERROR_CODE.Unauthorized };
}

export function unexpected(cause?: string): UnexpectedError {
  return cause === undefined
    ? { code: REPOSITORY_ERROR_CODE.Unexpected }
    : { code: REPOSITORY_ERROR_CODE.Unexpected, cause };
}
