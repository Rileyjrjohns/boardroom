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
  /** The key of a vote (`idempotencyKeyOf`), percent-encoded: a retry carries the same value. */
  IdempotencyKey: 'Idempotency-Key',
} as const;

export const MEDIA_TYPE_JSON = 'application/json';

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
  /** The request was understood and refused by a business rule: the body says which. */
  /** The body of the request is bigger than the server accepts. */
  RequestEntityTooLarge: 413,
  UnprocessableContent: 422,
  InternalServerError: 500,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
} as const;

/** The statuses that say the service behind the gateway cannot be reached right now. */
export const UNREACHABLE_STATUSES: readonly number[] = [
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
