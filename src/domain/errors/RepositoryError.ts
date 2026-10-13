export const REPOSITORY_ERROR_CODE = {
  NetworkUnavailable: 'networkUnavailable',
  NotFound: 'notFound',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
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

/**
 * The session is no longer valid: the remote source does not accept the credentials of the caller
 * (expired, revoked, signed out elsewhere). It concerns everything the caller holds, not one item:
 * the application empties both caches. To be told apart from `forbidden`.
 */
export interface UnauthorizedError {
  readonly code: typeof REPOSITORY_ERROR_CODE.Unauthorized;
}

/**
 * The session is valid, but this user may not see this item (they were removed from the meeting,
 * the document is restricted). It concerns one item: the application drops it, and what hangs off
 * it, from the caches. A server that prefers not to reveal that the item exists answers `notFound`
 * instead, and the application treats the two the same way.
 */
export interface ForbiddenError {
  readonly code: typeof REPOSITORY_ERROR_CODE.Forbidden;
}

/**
 * Anything else: a server fault, an answer that cannot be read. `cause` is a technical diagnostic
 * for the monitoring tools. It is never shown to the user, and it is a status code and a kind of
 * failure, nothing else: never a file path, a URL, the location of a document or its title, a name,
 * an email, an id taken from a query, nor the choice of a vote.
 */
export interface UnexpectedError {
  readonly code: typeof REPOSITORY_ERROR_CODE.Unexpected;
  readonly cause?: string;
}

/** What a remote call can fail with when it addresses no particular item (a listing). */
export type GatewayError = NetworkUnavailableError | UnauthorizedError | UnexpectedError;

/** What a remote call can fail with when it addresses one item. */
export type RepositoryError = GatewayError | NotFoundError | ForbiddenError;

export function networkUnavailable(): NetworkUnavailableError {
  return { code: REPOSITORY_ERROR_CODE.NetworkUnavailable };
}

export function notFound(): NotFoundError {
  return { code: REPOSITORY_ERROR_CODE.NotFound };
}

export function unauthorized(): UnauthorizedError {
  return { code: REPOSITORY_ERROR_CODE.Unauthorized };
}

export function forbidden(): ForbiddenError {
  return { code: REPOSITORY_ERROR_CODE.Forbidden };
}

export function unexpected(cause?: string): UnexpectedError {
  return cause === undefined
    ? { code: REPOSITORY_ERROR_CODE.Unexpected }
    : { code: REPOSITORY_ERROR_CODE.Unexpected, cause };
}
