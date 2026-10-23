import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import type { CacheResource } from '@core/application/offline/CacheResource';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';
import type { SessionDataPurger } from '@features/auth/application/ports/SessionDataPurger';

import type { DocumentCache } from './ports/DocumentCache';

/**
 * What the documents leave on the device for a session (the entries and the content of the
 * documents viewed), emptied when the session ends. It is the part of the documents in the list of
 * purgers that `auth` runs (see `SessionDataPurger`).
 */
export class DocumentCachePurger implements SessionDataPurger {
  readonly resource: CacheResource = CACHE_RESOURCE.Document;

  constructor(private readonly cache: Pick<DocumentCache, 'purge'>) {}

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    return this.cache.purge();
  }
}
