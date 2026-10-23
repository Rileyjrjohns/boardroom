// The constants of the API, shared by the client and by the simulated server, so that the two
// cannot disagree about a route, a header or a status. docs/api.md describes them for people.

/** The methods the API uses. */
export const HTTP_METHOD = {
  Get: 'GET',
  Head: 'HEAD',
  Post: 'POST',
} as const;

export const HTTP_HEADER = {
  Authorization: 'Authorization',
  Accept: 'Accept',
  ContentType: 'Content-Type',
  CacheControl: 'Cache-Control',
  ContentLength: 'Content-Length',
  /** The version of what was sent: it changes when the content does. */
  ETag: 'ETag',
  /** The key of a vote (`idempotencyKeyOf`), percent-encoded: a retry carries the same value. */
  IdempotencyKey: 'Idempotency-Key',
} as const;

export const MEDIA_TYPE_JSON = 'application/json';
export const MEDIA_TYPE_PDF = 'application/pdf';

/**
 * What every request and every answer says about caching: nothing of the API is stored by an
 * intermediary or by the HTTP cache of the platform. The answers are confidential.
 */
export const CACHE_CONTROL_NO_STORE = 'no-store';

/**
 * How big an answer may be, in bytes. A page of fifty meetings is a few tens of kilobytes and a
 * meeting with its agenda and its participants some hundreds: two megabytes is far above any
 * answer the API gives, and far below what a hostile or broken server could make the app hold.
 */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * How big the content of a document may be, in bytes. A board pack of a few hundred pages is some
 * megabytes; twenty is far above any document the API serves, and far below what a hostile or
 * broken server could make the app write to the device.
 */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

/** The only kind of token the API issues, and the scheme of the `Authorization` header. */
export const BEARER_TOKEN_TYPE = 'Bearer';

/** The scheme of the `Authorization` header, with the space that separates it from the token. */
export const BEARER_PREFIX = `${BEARER_TOKEN_TYPE} `;

export const HTTP_STATUS = {
  Ok: 200,
  NoContent: 204,
  BadRequest: 400,
  Unauthorized: 401,
  Forbidden: 403,
  NotFound: 404,
  /** The server gave up waiting for the request. */
  RequestTimeout: 408,
  /** The body of the request is bigger than the server accepts. */
  RequestEntityTooLarge: 413,
  /** The request was understood and refused by a business rule: the body says which. */
  UnprocessableContent: 422,
  /** Too many requests: the server asks the client to come back later. */
  TooManyRequests: 429,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;

/**
 * The statuses that say nothing about the request but that the service cannot take it right now:
 * the server gave up waiting for it (408), asks to be given time (429), or the service behind the
 * gateway cannot be reached (502, 503, 504). The client treats them like a network that failed,
 * so that the saved copy is served and a queue of votes is not given up during an outage.
 */
export const TRANSIENT_STATUSES: readonly number[] = [
  HTTP_STATUS.RequestTimeout,
  HTTP_STATUS.TooManyRequests,
  HTTP_STATUS.BadGateway,
  HTTP_STATUS.ServiceUnavailable,
  HTTP_STATUS.GatewayTimeout,
];

export const QUERY_PARAMETER = {
  Period: 'period',
  Limit: 'limit',
  Cursor: 'cursor',
} as const;

/** The first segment of each route. */
export const ROUTE_ROOT = {
  Auth: 'auth',
  Meetings: 'meetings',
  Documents: 'documents',
  Votes: 'votes',
} as const;

export const ROUTE_ACTION = {
  SignIn: 'sign-in',
  Content: 'content',
} as const;

const SEPARATOR = '/';

/** A path from its segments. A segment that is an identifier is percent-encoded by the caller. */
function path(...segments: readonly string[]): string {
  return [''].concat(segments).join(SEPARATOR);
}

/** The routes of the API. An identifier is opaque and free text, so it is percent-encoded. */
export const ROUTES = {
  signIn: path(ROUTE_ROOT.Auth, ROUTE_ACTION.SignIn),
  meetings: path(ROUTE_ROOT.Meetings),
  meeting: (id: string) => path(ROUTE_ROOT.Meetings, encodeURIComponent(id)),
  document: (id: string) => path(ROUTE_ROOT.Documents, encodeURIComponent(id)),
  documentContent: (id: string) =>
    path(ROUTE_ROOT.Documents, encodeURIComponent(id), ROUTE_ACTION.Content),
  votes: path(ROUTE_ROOT.Votes),
} as const;

/** How many segments each route has, for the server to tell them apart. */
export const SEGMENT_COUNT = {
  Collection: 1,
  Item: 2,
  Action: 3,
} as const;
