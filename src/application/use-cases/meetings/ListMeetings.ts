import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { SessionChangedError } from '@domain/errors/AuthenticationError';
import type { GatewayError } from '@domain/errors/RepositoryError';
import { isErr } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { Page } from '@domain/value-objects/Page';
import type { PageRequest } from '@domain/value-objects/PageRequest';

import type { MeetingCache, MeetingPageKey } from '../../ports/MeetingCache';
import type { MeetingRepository } from '../../ports/MeetingRepository';
import { LOG_ATTRIBUTE } from '../../ports/Monitoring';
import type { Loaded } from '../../shared/Loaded';
import { CACHE_RESOURCE } from '../../shared/CacheResource';
import { loadWithCacheFallback } from '../../shared/loadWithCacheFallback';
import type { CacheFallbackDeps } from '../../shared/loadWithCacheFallback';
import { requireSession } from '../../shared/requireSession';
import type { SessionRequiredError } from '../../shared/requireSession';

export interface ListMeetingsDeps extends CacheFallbackDeps {
  readonly meetings: MeetingRepository;
  readonly meetingCache: MeetingCache;
}

export interface ListMeetingsInput {
  readonly period: MeetingPeriod;
  readonly request: PageRequest;
}

export type ListMeetingsError = SessionRequiredError | SessionChangedError | GatewayError;

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
