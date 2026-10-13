import type { z } from 'zod';

import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
  unexpected,
} from '@domain/errors/RepositoryError';
import type {
  ForbiddenError,
  NetworkUnavailableError,
  NotFoundError,
  UnauthorizedError,
  UnexpectedError,
} from '@domain/errors/RepositoryError';
import type { StorageReadFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';
import type { Monitoring } from '@application/ports/Monitoring';

import { issuePathsOf } from './dto/wire';
import {
  HTTP_STATUS,
  HTTP_HEADER,
  BEARER_PREFIX,
  MEDIA_TYPE_JSON,
  UNREACHABLE_STATUSES,
} from './protocol';
import type { HTTP_METHOD } from './protocol';
import { statusCause } from './statusCause';
import { WHOLE_BODY_PATH, schemaViolation } from './invalidResponse';
import type { HttpResource } from './invalidResponse';

/** Where a request gets the token of the signed-in user, at the moment the request is created. */
export interface BearerTokenSource {
  token(): Promise<Result<string | undefined, StorageReadFailedError>>;
}

/** What the client needs of the `Response` of `fetch`: the status and the body as text. */
export interface FetchedResponse {
  readonly status: number;
  text(): Promise<string>;
}

export interface FetchRequestInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly signal: AbortSignal;
}

/** The `fetch` function, as far as the client uses it. */
export type FetchFunction = (url: string, init: FetchRequestInit) => Promise<FetchedResponse>;

export interface HttpClientOptions {
  /** The address of the API, with no trailing slash (see `parseApiBaseUrl`). */
  readonly baseUrl: string;
  /** How long a request may take, answer included. A request that takes longer is a failure. */
  readonly timeout: Duration;
  readonly tokens: BearerTokenSource;
  readonly monitoring: Monitoring;
  /** Replaces the global `fetch`, for a test of the client itself. */
  readonly fetch?: FetchFunction;
}

export type HttpMethod = (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];

export interface HttpRequestSpec<T> {
  readonly method: HttpMethod;
  /** Starts with a slash. See `ROUTES`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  /** Sent as JSON. */
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Whether the request carries the token of the signed-in user. By default it does. */
  readonly authenticated?: boolean;
  /** What is asked for, for the logs. */
  readonly resource: HttpResource;
  /** The shape of the body of a success. An empty body is read as `undefined`. */
  readonly schema: z.ZodType<T>;
}

export const HTTP_FAILURE_CODE = {
  /** The server understood the request and refused it by a business rule. */
  RequestRejected: 'requestRejected',
} as const;

/** The server refused the request by a business rule. `error` is its description. */
export interface RequestRejected {
  readonly code: typeof HTTP_FAILURE_CODE.RequestRejected;
  /** The `error` member of the body, which only the caller knows how to read. */
  readonly error: unknown;
}

/** Everything a request can end with, short of a success. */
export type HttpFailure =
  | NetworkUnavailableError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | UnexpectedError
  | RequestRejected;

const FAILURE_CAUSE = {
  CredentialsUnreadable: 'credentials unreadable',
  RequestNotBuilt: 'request could not be built',
} as const;

const SUCCESS_STATUS_FROM = 200;
const SUCCESS_STATUS_BELOW = 300;

const QUERY_START = '?';
const QUERY_SEPARATOR = '&';
const QUERY_ASSIGN = '=';

/** The outcome of a timer that won the race against the request. */
const TIMED_OUT = Symbol('timed out');

interface PreparedRequest {
  readonly url: string;
  readonly init: Omit<FetchRequestInit, 'signal'>;
}

interface RawResponse {
  readonly status: number;
  readonly text: string;
}

/**
 * The one place that talks to the network: a small client over the global `fetch`, for the JSON
 * API of the app. It never throws and never hangs.
 *
 * - The token of the signed-in user is read when the request is created and attached to it, so the
 *   answer is the one for that user even if somebody else signs in while it is on its way. A
 *   request that needs a token and finds none is `unauthorized` without being sent.
 * - A failure to reach the server, an answer that does not come in time (the request is aborted)
 *   and an answer that is cut off are all `networkUnavailable`, as are the statuses that say the
 *   service behind a gateway cannot be reached (502, 503, 504).
 * - 401 is `unauthorized`, 403 `forbidden`, 404 `notFound`. 422 is a business rejection: the
 *   caller gets the description the server gave, and reads it. Any other status is `unexpected`,
 *   whose `cause` is the status and nothing else: no URL, no path, no body.
 * - The body of a success is checked against the schema the caller gives. A body that is not JSON
 *   or does not match is `unexpected`, and the paths of the fields that did not match (never their
 *   values) go to the monitoring.
 */
export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  async request<T>(spec: HttpRequestSpec<T>): Promise<Result<T, HttpFailure>> {
    const prepared = await this.prepare(spec);
    if (!prepared.ok) return prepared;

    const response = await this.exchange(prepared.value);
    if (!response.ok) return response;

    return this.interpret(spec, response.value);
  }

  private async prepare<T>(
    spec: HttpRequestSpec<T>,
  ): Promise<Result<PreparedRequest, HttpFailure>> {
    const headers: Record<string, string> = {
      [HTTP_HEADER.Accept]: MEDIA_TYPE_JSON,
      ...spec.headers,
    };

    if (spec.authenticated ?? true) {
      const token = await this.options.tokens.token();
      if (!token.ok) return err(unexpected(FAILURE_CAUSE.CredentialsUnreadable));
      if (token.value === undefined) return err(unauthorized());
      headers[HTTP_HEADER.Authorization] = `${BEARER_PREFIX}${token.value}`;
    }

    const body = serialise(spec.body);
    if (!body.ok) return body;
    if (body.value !== undefined) headers[HTTP_HEADER.ContentType] = MEDIA_TYPE_JSON;

    return ok({
      url: `${this.options.baseUrl}${spec.path}${queryOf(spec.query)}`,
      init: {
        method: spec.method,
        headers,
        ...(body.value === undefined ? {} : { body: body.value }),
      },
    });
  }

  /** Sends the request and reads the whole answer, within the time allowed. */
  private async exchange(
    request: PreparedRequest,
  ): Promise<Result<RawResponse, NetworkUnavailableError>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(TIMED_OUT);
      }, this.options.timeout);
    });

    try {
      const outcome = await Promise.race([this.send(request, controller.signal), expired]);
      return outcome === TIMED_OUT ? err(networkUnavailable()) : outcome;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Never rejects: whatever goes wrong on the way is a network that failed. */
  private async send(
    request: PreparedRequest,
    signal: AbortSignal,
  ): Promise<Result<RawResponse, NetworkUnavailableError>> {
    try {
      const send = this.options.fetch ?? ((url, init) => fetch(url, init));
      const response = await send(request.url, { ...request.init, signal });
      return ok({ status: response.status, text: await response.text() });
    } catch {
      return err(networkUnavailable());
    }
  }

  private interpret<T>(spec: HttpRequestSpec<T>, response: RawResponse): Result<T, HttpFailure> {
    const { status } = response;
    if (status >= SUCCESS_STATUS_FROM && status < SUCCESS_STATUS_BELOW) {
      return this.readSuccess(spec, response);
    }
    if (UNREACHABLE_STATUSES.includes(status)) return err(networkUnavailable());

    switch (status) {
      case HTTP_STATUS.Unauthorized:
        return err(unauthorized());
      case HTTP_STATUS.Forbidden:
        return err(forbidden());
      case HTTP_STATUS.NotFound:
        return err(notFound());
      case HTTP_STATUS.UnprocessableContent:
        return readRejection(response.text) ?? err(unexpected(statusCause(status)));
      default:
        return err(unexpected(statusCause(status)));
    }
  }

  private readSuccess<T>(spec: HttpRequestSpec<T>, response: RawResponse): Result<T, HttpFailure> {
    const { monitoring } = this.options;
    const text = response.text.trim();
    let json: unknown;
    if (text !== '') {
      try {
        json = JSON.parse(text);
      } catch {
        return err(schemaViolation(monitoring, spec.resource, WHOLE_BODY_PATH));
      }
    }

    const parsed = spec.schema.safeParse(json);
    return parsed.success
      ? ok(parsed.data)
      : err(schemaViolation(monitoring, spec.resource, issuePathsOf(parsed.error)));
  }
}

/** The body of a request as JSON. A value that has no JSON form is a request that cannot be sent. */
function serialise(body: unknown): Result<string | undefined, UnexpectedError> {
  if (body === undefined) return ok(undefined);
  try {
    return ok(JSON.stringify(body));
  } catch {
    return err(unexpected(FAILURE_CAUSE.RequestNotBuilt));
  }
}

/** `?name=value&...` with every name and value percent-encoded, or nothing for no parameter. */
function queryOf(query: HttpRequestSpec<unknown>['query']): string {
  const pairs = Object.entries(query ?? {}).flatMap(([name, value]) =>
    value === undefined
      ? []
      : [`${encodeURIComponent(name)}${QUERY_ASSIGN}${encodeURIComponent(String(value))}`],
  );
  return pairs.length === 0 ? '' : `${QUERY_START}${pairs.join(QUERY_SEPARATOR)}`;
}

/** The `error` member of the body of a 422, or `undefined` when the body does not have one. */
function readRejection(text: string): Result<never, RequestRejected> | undefined {
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === 'object' && body !== null && 'error' in body) {
      return err({ code: HTTP_FAILURE_CODE.RequestRejected, error: body.error });
    }
  } catch {
    // A body that is not JSON is not a description: the caller gets a plain status.
  }
  return undefined;
}
