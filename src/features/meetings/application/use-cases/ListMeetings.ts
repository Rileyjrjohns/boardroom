import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import type { Loaded } from '@core/application/offline/Loaded';
import { loadWithCacheFallback } from '@core/application/offline/loadWithCacheFallback';
import type { CacheFallbackDeps } from '@core/application/offline/loadWithCacheFallback';
import { LOG_ATTRIBUTE } from '@core/application/ports/Monitoring';
import type { GatewayError } from '@core/domain/errors/RepositoryError';
import { isErr } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Page } from '@core/domain/value-objects/Page';
import type { PageRequest } from '@core/domain/value-objects/PageRequest';
import type { SessionGateError } from '@features/auth/application/session/AuthSessionGate';
import { requireSession } from '@features/auth/application/session/requireSession';
import type { RequireSessionDeps } from '@features/auth/application/session/requireSession';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

import type { MeetingCache, MeetingPageKey } from '../ports/MeetingCache';
import type { MeetingRepository } from '../ports/MeetingRepository';

export interface ListMeetingsDeps extends CacheFallbackDeps<SessionGateError>, RequireSessionDeps {
  readonly meetings: MeetingRepository;
  readonly meetingCache: MeetingCache;
}

export interface ListMeetingsInput {
  readonly period: MeetingPeriod;
  readonly request: PageRequest;
}

export type ListMeetingsError = SessionGateError | GatewayError;

/**
 * One page of the upcoming or the past meetings, for the first load, the pull to refresh and the
 * pagination alike. The server decides which meetings are upcoming and which are past.
 *
 * Requires a valid session: the cache belongs to the signed-in user, and nothing is read without
 * knowing who asks. Follows the offline policy of `loadWithCacheFallback`: fresh data from the
 * server and written through to the cache, or, when there is no network, the cached page flagged
 * stale (if it is not too old). A refusal of the session (`unauthorized`) empties both caches. If
 * the user changed while the request was in flight, nothing is written and the answer is
 * `sessionChanged`. A locked app answers `appLocked` (see `AppLock`).
 */
export class ListMeetings {
  constructor(private readonly deps: ListMeetingsDeps) {}

  async execute(
    input: ListMeetingsInput,
  ): Promise<Result<Loaded<Page<MeetingSummary>>, ListMeetingsError>> {
    const { meetings, meetingCache } = this.deps;
    const { period, request } = input;

    const session = await requireSession(this.deps);
    if (isErr(session)) return session;
    const owner = session.value.user.id;

    const key: MeetingPageKey =
      request.cursor === undefined
        ? { period, limit: request.limit }
        : { period, cursor: request.cursor, limit: request.limit };

    return loadWithCacheFallback(this.deps, owner, {
      resource: CACHE_RESOURCE.MeetingPage,
      attributes: { [LOG_ATTRIBUTE.Period]: period },
      fetch: () => meetings.list(period, request),
      save: (page, cachedAt) => meetingCache.savePage(owner, key, page, cachedAt),
      read: () => meetingCache.readPage(owner, key),
      remove: () => meetingCache.removePage(owner, key),
      revoke: () => meetingCache.removePage(owner, key),
    });
  }
}
