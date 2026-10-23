import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId, UserId } from '@core/domain/value-objects/ids';

/**
 * Where a document a meeting lists is dropped from the device when the user may no longer see that
 * meeting. A meeting lists documents, so the rule "the documents of a meeting that the server
 * refuses go with it" is the meeting's; who keeps a copy of a document is not, so the copy is
 * reached through this port, which the feature that keeps documents implements
 * (`DocumentCacheEvictor`) and the composition hands to `loadMeeting`.
 */
export interface MeetingDocumentEvictor {
  /**
   * Removes the copy of the document `id` that `owner` kept on the device, with its content.
   * Succeeds when there is none. Never throws.
   */
  evict(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>>;
}
