import { createSession } from '@domain/entities/Session';
import type { Session } from '@domain/entities/Session';
import { isVotingError } from '@domain/errors/VotingError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type { VotingError } from '@domain/errors/VotingError';
import { isErr, ok } from '@domain/shared/Result';
import { parseEmailAddress } from '@domain/value-objects/EmailAddress';
import type { Duration } from '@domain/value-objects/Duration';
import { parseDocumentId, parseMeetingId } from '@domain/value-objects/ids';
import { plus } from '@domain/value-objects/Instant';
import { durationFromMillis } from '@domain/value-objects/Duration';
import { parseMeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { parsePageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import type { Clock } from '@application/ports/Clock';

import { toDocumentContentWire, toDocumentWire } from '../http/dto/documentDto';
import { toMeetingPageWire, toMeetingWire } from '../http/dto/meetingDto';
import { signInRequestSchema, toSignInResponseWire } from '../http/dto/sessionDto';
import { toVote, voteRequestSchema } from '../http/dto/voteDto';
import {
  BEARER_PREFIX,
  HTTP_HEADER,
  HTTP_METHOD,
  HTTP_STATUS,
  MEDIA_TYPE_JSON,
  QUERY_PARAMETER,
  ROUTE_ACTION,
  ROUTE_ROOT,
  SEGMENT_COUNT,
} from '../http/protocol';
import type { DemoAccount } from '../in-memory/InMemoryAuthSession';
import type { Caller, InMemoryBackend } from '../in-memory/InMemoryBackend';
import { toVotingErrorWire } from '../shared/rejectionSchemas';

/** The `code` of the body of an error: `{ "error": { "code": "..." } }`. Documented in docs/api.md. */
export const API_ERROR_CODE = {
  BadRequest: 'badRequest',
  InvalidCredentials: 'invalidCredentials',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'notFound',
  ServiceUnavailable: 'serviceUnavailable',
  Unexpected: 'unexpected',
} as const;

type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

const MILLIS_PER_SECOND = 1000;

export interface MockApiOptions {
  /** The simulated server: the rules, and the content. The API is a window on it. */
  readonly backend: InMemoryBackend;
  /** The clock of the server: the sessions it grants expire on it. */
  readonly clock: Clock;
  readonly accounts: readonly DemoAccount[];
  /** How long a token lasts, from the sign-in. Whole seconds are what the API says. */
  readonly sessionLifetime: Duration;
  /** A token that nobody can guess. Given from outside, because this layer holds no randomness. */
  readonly generateToken: () => string;
}

/** What a request amounts to once the path and the method are read. */
type Route =
  | { readonly name: 'signIn' }
  | { readonly name: 'listMeetings' }
  | { readonly name: 'getMeeting'; readonly id: string }
  | { readonly name: 'getDocument'; readonly id: string }
  | { readonly name: 'getDocumentContent'; readonly id: string }
  | { readonly name: 'castVote' };

/**
 * The HTTP API of docs/api.md, served from the simulated server. It is a function from a `Request`
 * to a `Response` and knows no network library: the tests give it to MSW, and `npm run mock:api`
 * gives it to the `http` module of Node, so one implementation of the rules serves both. The
 * business rules are not here: the routes only read the request, authenticate it from its token,
 * ask the `InMemoryBackend`, and write its answer the way the API says.
 *
 * Server side code, never part of the app: nothing under `app/` or `src/presentation` reaches it.
 */
export class MockApi {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly options: MockApiOptions) {}

  /** The server forgets every token it granted: the next request of each holder is refused. */
  revokeSessions(): void {
    this.sessions.clear();
  }

  async handle(request: Request): Promise<Response> {
    const route = routeOf(request);
    if (route === undefined) return failure(HTTP_STATUS.NotFound, API_ERROR_CODE.NotFound);

    switch (route.name) {
      case 'signIn':
        return this.signIn(request);
      case 'listMeetings':
        return this.listMeetings(request);
      case 'getMeeting':
        return this.getMeeting(request, route.id);
      case 'getDocument':
        return this.getDocument(request, route.id);
      case 'getDocumentContent':
        return this.getDocumentContent(request, route.id);
      case 'castVote':
        return this.castVote(request);
    }
  }

  private async signIn(request: Request): Promise<Response> {
    const body = signInRequestSchema.safeParse(await readJson(request));
    if (!body.success) return failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest);

    const reached = await this.options.backend.network.enter();
    if (isErr(reached)) return unavailable();

    const email = parseEmailAddress(body.data.email);
    const account = email.ok
      ? this.options.accounts.find(({ user }) => user.email === email.value)
      : undefined;
    if (account === undefined || account.password !== body.data.password) {
      return failure(HTTP_STATUS.Unauthorized, API_ERROR_CODE.InvalidCredentials);
    }

    const lifetimeSeconds = Math.floor(this.options.sessionLifetime / MILLIS_PER_SECOND);
    const lifetime = durationFromMillis(lifetimeSeconds * MILLIS_PER_SECOND);
    const expiresAt = lifetime.ok ? plus(this.options.clock.now(), lifetime.value) : lifetime;
    if (!expiresAt.ok) return failure(HTTP_STATUS.InternalServerError, API_ERROR_CODE.Unexpected);

    const session = createSession({ user: account.user, expiresAt: expiresAt.value });
    const token = this.options.generateToken();
    this.sessions.set(token, session);
    return json(HTTP_STATUS.Ok, toSignInResponseWire({ token, session }, lifetimeSeconds));
  }

  private async listMeetings(request: Request): Promise<Response> {
    const query = new URL(request.url).searchParams;
    const period = parseMeetingPeriod(query.get(QUERY_PARAMETER.Period) ?? '');
    const rawCursor = query.get(QUERY_PARAMETER.Cursor);
    const cursor = rawCursor === null ? undefined : parsePageCursor(rawCursor);
    const limit = Number(query.get(QUERY_PARAMETER.Limit) ?? Number.NaN);
    if (!period.ok || (cursor !== undefined && !cursor.ok)) {
      return failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest);
    }
    const page = createPageRequest({
      limit,
      ...(cursor === undefined || !cursor.ok ? {} : { cursor: cursor.value }),
    });
    if (!page.ok) return failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest);

    const answer = await this.options.backend.listMeetings(
      period.value,
      page.value,
      this.callerOf(request),
    );
    if (answer.ok) return json(HTTP_STATUS.Ok, toMeetingPageWire(answer.value));
    // The only way the simulated server refuses a listing it can authenticate is a cursor or a
    // limit it does not accept: the request was wrong.
    return answer.error.code === REPOSITORY_ERROR_CODE.Unexpected
      ? failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest)
      : refusal(answer.error);
  }

  private async getMeeting(request: Request, rawId: string): Promise<Response> {
    const id = parseMeetingId(rawId);
    if (!id.ok) return failure(HTTP_STATUS.NotFound, API_ERROR_CODE.NotFound);

    const answer = await this.options.backend.getMeeting(id.value, this.callerOf(request));
    return answer.ok ? json(HTTP_STATUS.Ok, toMeetingWire(answer.value)) : refusal(answer.error);
  }

  private async getDocument(request: Request, rawId: string): Promise<Response> {
    const id = parseDocumentId(rawId);
    if (!id.ok) return failure(HTTP_STATUS.NotFound, API_ERROR_CODE.NotFound);

    const answer = await this.options.backend.getDocument(id.value, this.callerOf(request));
    return answer.ok ? json(HTTP_STATUS.Ok, toDocumentWire(answer.value)) : refusal(answer.error);
  }

  private async getDocumentContent(request: Request, rawId: string): Promise<Response> {
    const id = parseDocumentId(rawId);
    if (!id.ok) return failure(HTTP_STATUS.NotFound, API_ERROR_CODE.NotFound);

    const answer = await this.options.backend.fetchDocumentContent(
      id.value,
      this.callerOf(request),
    );
    return answer.ok
      ? json(HTTP_STATUS.Ok, toDocumentContentWire(answer.value))
      : refusal(answer.error);
  }

  private async castVote(request: Request): Promise<Response> {
    const body = voteRequestSchema.safeParse(await readJson(request));
    const vote = body.success ? toVote(body.data) : undefined;
    if (vote === undefined || !vote.ok) {
      return failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest);
    }
    // The header and the body say the same thing, or the request is not one this server issued.
    const header = request.headers.get(HTTP_HEADER.IdempotencyKey);
    if (header === null || decodeOrUndefined(header) !== vote.value.idempotencyKey) {
      return failure(HTTP_STATUS.BadRequest, API_ERROR_CODE.BadRequest);
    }

    const answer = await this.options.backend.submitVote(vote.value, this.callerOf(request));
    if (answer.ok) return new Response(null, { status: HTTP_STATUS.NoContent });
    return isVotingError(answer.error) ? rejection(answer.error) : refusal(answer.error);
  }

  /**
   * Who the request is from, read from its token when the request is received. A token the server
   * does not know, or no token, is nobody: the simulated server then answers `unauthorized`, and
   * checks the expiry of the session itself.
   */
  private callerOf(request: Request): Caller {
    const header = request.headers.get(HTTP_HEADER.Authorization);
    const token = header?.startsWith(BEARER_PREFIX)
      ? header.slice(BEARER_PREFIX.length)
      : undefined;
    const session = token === undefined ? undefined : this.sessions.get(token);
    return { current: () => Promise.resolve(ok(session)) };
  }
}

function routeOf(request: Request): Route | undefined {
  const segments = new URL(request.url).pathname
    .split('/')
    .filter((segment) => segment !== '')
    .map(decodeOrUndefined);
  if (segments.includes(undefined)) return undefined;
  const [root, second, third] = segments as string[];
  const { method } = request;

  switch (segments.length) {
    case SEGMENT_COUNT.Collection:
      if (root === ROUTE_ROOT.Meetings && method === HTTP_METHOD.Get)
        return { name: 'listMeetings' };
      if (root === ROUTE_ROOT.Votes && method === HTTP_METHOD.Post) return { name: 'castVote' };
      return undefined;
    case SEGMENT_COUNT.Item:
      if (
        root === ROUTE_ROOT.Auth &&
        second === ROUTE_ACTION.SignIn &&
        method === HTTP_METHOD.Post
      ) {
        return { name: 'signIn' };
      }
      if (second === undefined || method !== HTTP_METHOD.Get) return undefined;
      if (root === ROUTE_ROOT.Meetings) return { name: 'getMeeting', id: second };
      if (root === ROUTE_ROOT.Documents) return { name: 'getDocument', id: second };
      return undefined;
    case SEGMENT_COUNT.Action:
      return root === ROUTE_ROOT.Documents &&
        second !== undefined &&
        third === ROUTE_ACTION.Content &&
        method === HTTP_METHOD.Get
        ? { name: 'getDocumentContent', id: second }
        : undefined;
    default:
      return undefined;
  }
}

/** The text with its percent-encoding undone, or `undefined` for an encoding that is malformed. */
function decodeOrUndefined(text: string): string | undefined {
  try {
    return decodeURIComponent(text);
  } catch {
    return undefined;
  }
}

/** The JSON a request carries, or `undefined` when it carries none. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { [HTTP_HEADER.ContentType]: MEDIA_TYPE_JSON },
  });
}

function failure(status: number, code: ApiErrorCode): Response {
  return json(status, { error: { code } });
}

function unavailable(): Response {
  return failure(HTTP_STATUS.ServiceUnavailable, API_ERROR_CODE.ServiceUnavailable);
}

/** The business rejection of a vote: 422, and the rule that refused it. */
function rejection(error: VotingError): Response {
  return json(HTTP_STATUS.UnprocessableContent, { error: toVotingErrorWire(error) });
}

/** The status of a refusal of the simulated server. */
function refusal(error: { readonly code: string }): Response {
  switch (error.code) {
    case REPOSITORY_ERROR_CODE.Unauthorized:
      return failure(HTTP_STATUS.Unauthorized, API_ERROR_CODE.Unauthorized);
    case REPOSITORY_ERROR_CODE.Forbidden:
      return failure(HTTP_STATUS.Forbidden, API_ERROR_CODE.Forbidden);
    case REPOSITORY_ERROR_CODE.NotFound:
      return failure(HTTP_STATUS.NotFound, API_ERROR_CODE.NotFound);
    case REPOSITORY_ERROR_CODE.NetworkUnavailable:
      return unavailable();
    default:
      return failure(HTTP_STATUS.InternalServerError, API_ERROR_CODE.Unexpected);
  }
}
