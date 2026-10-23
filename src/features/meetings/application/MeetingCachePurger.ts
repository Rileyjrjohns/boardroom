import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import type { CacheResource } from '@core/application/offline/CacheResource';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';
import type { SessionDataPurger } from '@features/auth/application/ports/SessionDataPurger';

import type { MeetingCache } from './ports/MeetingCache';

/**
 * What the meetings leave on the device for a session (the pages of the list and the meetings
 * viewed), emptied when the session ends. It is the part of the meetings in the list of purgers
 * that `auth` runs (see `SessionDataPurger`).
 */
export class MeetingCachePurger implements SessionDataPurger {
  readonly resource: CacheResource = CACHE_RESOURCE.Meeting;

  constructor(private readonly cache: Pick<MeetingCache, 'purge'>) {}

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    return this.cache.purge();
  }
}
