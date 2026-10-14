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
import type { UserId } from '@domain/value-objects/ids';
import type { Monitoring } from '@application/ports/Monitoring';

import { issuePathsOf } from '../shared/issuePaths';
import {
  BEARER_PREFIX,
  CACHE_CONTROL_NO_STORE,
  HTTP_HEADER,
  HTTP_STATUS,
  MAX_RESPONSE_BYTES,
  MEDIA_TYPE_JSON,
  TRANSIENT_STATUSES,
} from './protocol';
import type { HTTP_METHOD } from './protocol';
import { statusCause } from './statusCause';
import { WHOLE_BODY_PATH, schemaViolation } from './invalidResponse';
import type { HttpResource } from './invalidResponse';

/** The token of the signed-in user, with the user it belongs to. */
export interface BearerToken {
  readonly token: string;
  readonly userId: UserId;
}

/**
 * Where a request gets the token of the signed-in user, at the moment the request is created. The
 * token comes with the user it belongs to, read in one go, so that a request made for a user can
 * check it is carrying that user's token and not somebody else's (see `HttpRequestSpec.forUser`).
 */
export interface BearerTokenSource {
  token(): Promise<Result<BearerToken | undefined, StorageReadFailedError>>;
}

/** The part of the headers of a response the client reads. */
export interface FetchedHeaders {
  get(name: string): string | null;
}

/** A stream of bytes. Not every platform gives one: React Native's `fetch` has no `body` to read. */
export interface FetchedBody {
  getReader(): {
    read(): Promise<{ readonly done: boolean; readonly value?: Uint8Array | undefined }>;
    cancel(): Promise<void>;
  };
}

/** What the client needs of the `Response` of `fetch`. */
export interface FetchedResponse {
  readonly status: number;
  readonly headers?: FetchedHeaders;
  readonly body?: FetchedBody | null;
  text(): Promise<string>;
}

export interface FetchRequestInit {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  /**
   * A redirect is an error, never followed: the API does not redirect, and a redirect would carry
   * the token to another address. (React Native's `fetch` may not honour it: see the README.)
   */
  readonly redirect: 'error';
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

/** What every request says; the ones that read their answer add the shape they expect. */
export interface HttpActionSpec {
  readonly method: HttpMethod;
  /** Starts with a slash. See `ROUTES`. */
  readonly path: string;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  /** Sent as JSON. */
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Whether the request carries the token of the signed-in user. By default it does. */
  readonly authenticated?: boolean;
  /**
   * The user the request is made for. The token the client attaches must be this user's: when it
   * is another's, or nobody's, the answer is `unauthorized` and nothing is sent. The token and its
   * user are read together, so a sign-in between the check of the caller and the request cannot
   * make the request travel under somebody else's session.
   */
  readonly forUser?: UserId;
  /** What is asked for, for the logs. */
  readonly resource: HttpResource;
}

export interface HttpRequestSpec<T> extends HttpActionSpec {
  /** The shape of the body of a success. An empty body is read as `undefined`. */
  readonly schema: z.ZodType<T>;
}

/**
 * A request is given as the description of it, or as a function that builds the description. The
 * function runs where the client can catch it: a path made of an identifier that cannot be encoded
 * is a request that cannot be built (`unexpected`), not an exception.
 */
export type Described<Spec> = Spec | (() => Spec);

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
  ResponseTooLarge: 'response too large',
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
  /** `undefined` when the body was not read: it was not wanted. */
  readonly text: string | undefined;
}

/** Why a response could not be had whole. */
const RESPONSE_FAILURE = {
  TooLarge: 'tooLarge',
  Network: 'network',
} as const;

type ResponseFailure = (typeof RESPONSE_FAILURE)[keyof typeof RESPONSE_FAILURE];

/**
 * The one place that talks to the network: a small client over the global `fetch`, for the JSON
 * API of the app. It never throws and never hangs.
 *
 * - The token of the signed-in user is read when the request is created and attached to it, so the
 *   answer is the one for that user even if somebody else signs in while it is on its way. A
 *   request that needs a token and finds none is `unauthorized` without being sent, and so is one
 *   made for a user whose token it does not hold (`forUser`).
 * - A request that cannot be built (an identifier that cannot be encoded, a body that has no JSON
 *   form) is `unexpected`, and nothing is sent.
 * - Every request refuses redirects and asks that nothing be stored (`Cache-Control: no-store`).
 * - A failure to reach the server, an answer that does not come in time (the request is aborted)
 *   and an answer that is cut off are all `networkUnavailable`, as are the statuses that say the
 *   service cannot take the request now: 408, 429, and 502, 503, 504 for a service behind a gateway
 *   that cannot be reached.
 * - 401 is `unauthorized`, 403 `forbidden`, 404 `notFound`. 422 is a business rejection: the
 *   caller gets the description the server gave, and reads it. Any other status, redirects
 *   included, is `unexpected`, whose `cause` is the status and nothing else: no URL, no path, no
 *   body.
 * - An answer is read up to `MAX_RESPONSE_BYTES`: one that declares more is refused unread, and a
 *   body that grows past it stops being read (`unexpected`, cause `response too large`).
 * - The body of a success is checked against the schema the caller gives (`request`), or is not
 *   read at all (`perform`). A body that is not JSON or does not match is `unexpected`, and the
 *   paths of the fields that did not match (never their values) go to the monitoring.
 */
export class HttpClient {
  constructor(private readonly options: HttpClientOptions) {}

  /** A request whose answer is read through a schema. */
  request<T>(described: Described<HttpRequestSpec<T>>): Promise<Result<T, HttpFailure>> {
    return this.run(described, true, (spec, response) => this.readSuccess(spec, response));
  }

  /** A request that is done once the server says it succeeded: the body of a success is not read. */
  perform(described: Described<HttpActionSpec>): Promise<Result<undefined, HttpFailure>> {
    return this.run(described, false, () => ok(undefined));
  }

  private async run<Spec extends HttpActionSpec, T>(
    described: Described<Spec>,
    readsSuccessBody: boolean,
    readSuccess: (spec: Spec, response: RawResponse) => Result<T, HttpFailure>,
  ): Promise<Result<T, HttpFailure>> {
    const prepared = await this.prepare(described);
    if (!prepared.ok) return prepared;

    const { request, spec } = prepared.value;
    const response = await this.exchange(request, readsSuccessBody);
    if (!response.ok) return response;

    return this.interpret(spec, response.value, readSuccess);
  }

  private async prepare<Spec extends HttpActionSpec>(
    described: Described<Spec>,
  ): Promise<Result<{ request: PreparedRequest; spec: Spec }, HttpFailure>> {
    let spec: Spec;
    let built: Omit<PreparedRequest, 'init'> & { headers: Record<string, string>; body?: string };
    try {
      spec = typeof described === 'function' ? described() : described;
      const body = spec.body === undefined ? undefined : JSON.stringify(spec.body);
      built = {
        url: `${this.options.baseUrl}${spec.path}${queryOf(spec.query)}`,
        headers: {
          [HTTP_HEADER.Accept]: MEDIA_TYPE_JSON,
          [HTTP_HEADER.CacheControl]: CACHE_CONTROL_NO_STORE,
          ...spec.headers,
          ...(body === undefined ? {} : { [HTTP_HEADER.ContentType]: MEDIA_TYPE_JSON }),
        },
        ...(body === undefined ? {} : { body }),
      };
    } catch {
      // Whatever it was (a lone surrogate, a body with no JSON form), it says nothing safe to keep.
      return err(unexpected(FAILURE_CAUSE.RequestNotBuilt));
    }

    if (spec.authenticated ?? true) {
      const token = await this.options.tokens.token();
      if (!token.ok) return err(unexpected(FAILURE_CAUSE.CredentialsUnreadable));
      if (token.value === undefined) return err(unauthorized());
      if (spec.forUser !== undefined && spec.forUser !== token.value.userId) {
        return err(unauthorized());
      }
      built.headers[HTTP_HEADER.Authorization] = `${BEARER_PREFIX}${token.value.token}`;
    }

    return ok({
      spec,
      request: {
        url: built.url,
        init: {
          method: spec.method,
          headers: built.headers,
          redirect: 'error',
          ...(built.body === undefined ? {} : { body: built.body }),
        },
      },
    });
  }

  /** Sends the request and reads the whole answer, within the time allowed. */
  private async exchange(
    request: PreparedRequest,
    readsSuccessBody: boolean,
  ): Promise<Result<RawResponse, HttpFailure>> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => {
        controller.abort();
        resolve(TIMED_OUT);
      }, this.options.timeout);
    });

    try {
      const outcome = await Promise.race([
        this.send(request, controller, readsSuccessBody),
        expired,
      ]);
      if (outcome === TIMED_OUT) return err(networkUnavailable());
      if (outcome.ok) return outcome;
      return err(
        outcome.error === RESPONSE_FAILURE.TooLarge
          ? unexpected(FAILURE_CAUSE.ResponseTooLarge)
          : networkUnavailable(),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Never rejects: whatever goes wrong on the way is a network that failed. */
  private async send(
    request: PreparedRequest,
    controller: AbortController,
    readsSuccessBody: boolean,
  ): Promise<Result<RawResponse, ResponseFailure>> {
    try {
      const send = this.options.fetch ?? fetchOverTheNetwork;
      const response = await send(request.url, { ...request.init, signal: controller.signal });
      if (isSuccess(response.status) && !readsSuccessBody) {
        return ok({ status: response.status, text: undefined });
      }
      const text = await readBounded(response);
      if (!text.ok) controller.abort();
      return text.ok ? ok({ status: response.status, text: text.value }) : text;
    } catch {
      return err(RESPONSE_FAILURE.Network);
    }
  }

  private interpret<Spec extends HttpActionSpec, T>(
    spec: Spec,
    response: RawResponse,
    readSuccess: (spec: Spec, response: RawResponse) => Result<T, HttpFailure>,
  ): Result<T, HttpFailure> {
    const { status } = response;
    if (isSuccess(status)) return readSuccess(spec, response);
    if (TRANSIENT_STATUSES.includes(status)) return err(networkUnavailable());

    switch (status) {
      case HTTP_STATUS.Unauthorized:
        return err(unauthorized());
      case HTTP_STATUS.Forbidden:
        return err(forbidden());
      case HTTP_STATUS.NotFound:
        return err(notFound());
      case HTTP_STATUS.UnprocessableContent:
        return readRejection(response.text ?? '') ?? err(unexpected(statusCause(status)));
      default:
        return err(unexpected(statusCause(status)));
    }
  }

  private readSuccess<T>(spec: HttpRequestSpec<T>, response: RawResponse): Result<T, HttpFailure> {
    const { monitoring } = this.options;
    const text = (response.text ?? '').trim();
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

/**
 * The global `fetch`, seen as far as the client uses it. The body is given only where the platform
 * has a stream to read (React Native's `fetch` has none).
 */
const fetchOverTheNetwork: FetchFunction = async (url, init) => {
  const response = await fetch(url, init);
  const { body } = response;
  return {
    status: response.status,
    headers: response.headers,
    body: body ? { getReader: () => body.getReader() } : null,
    text: () => response.text(),
  };
};

const isSuccess = (status: number): boolean =>
  status >= SUCCESS_STATUS_FROM && status < SUCCESS_STATUS_BELOW;

/**
 * The body of a response as text, if it fits in `MAX_RESPONSE_BYTES`. The length it declares is
 * checked first; then the body is read as a stream where the platform gives one, and abandoned as
 * soon as it grows past the maximum. Where it does not (React Native), it is read whole and its
 * length checked after: the protection is then the timeout, which bounds how much can arrive.
 */
async function readBounded(response: FetchedResponse): Promise<Result<string, ResponseFailure>> {
  const declared = Number(response.headers?.get(HTTP_HEADER.ContentLength) ?? Number.NaN);
  if (Number.isInteger(declared) && declared > MAX_RESPONSE_BYTES) {
    return err(RESPONSE_FAILURE.TooLarge);
  }

  if (!response.body) {
    const text = await response.text();
    return text.length > MAX_RESPONSE_BYTES ? err(RESPONSE_FAILURE.TooLarge) : ok(text);
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done || chunk.value === undefined) break;
    size += chunk.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      return err(RESPONSE_FAILURE.TooLarge);
    }
    chunks.push(chunk.value);
  }
  const whole = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    whole.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return ok(new TextDecoder().decode(whole));
}

/** `?name=value&...` with every name and value percent-encoded, or nothing for no parameter. */
function queryOf(query: HttpActionSpec['query']): string {
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
