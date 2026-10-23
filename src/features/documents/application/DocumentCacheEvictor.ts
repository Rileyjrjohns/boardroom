import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId, UserId } from '@core/domain/value-objects/ids';
import type { MeetingDocumentEvictor } from '@features/meetings/application/ports/MeetingDocumentEvictor';

import type { DocumentCache } from './ports/DocumentCache';

/**
 * Drops the copy of a document from the document cache: the way the documents of a meeting that the
 * server refuses leave the device (see `MeetingDocumentEvictor`).
 */
export class DocumentCacheEvictor implements MeetingDocumentEvictor {
  constructor(private readonly cache: Pick<DocumentCache, 'remove'>) {}

  evict(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>> {
    return this.cache.remove(owner, id);
  }
}
