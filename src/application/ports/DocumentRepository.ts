import type { Document } from '@domain/entities/Document';
import type { RepositoryError } from '@domain/errors/RepositoryError';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId } from '@domain/value-objects/ids';
import type { Result } from '@domain/shared/Result';

/**
 * The remote source of truth for documents. Read only.
 *
 * Contract: no method throws or rejects, and every method settles in bounded time (a download that
 * times out is `networkUnavailable`); failures are error `Result`s, as for `MeetingRepository`,
 * with the same rule for the `cause` of `unexpected`: no personal data, no query values.
 */
export interface DocumentRepository {
  get(id: DocumentId): Promise<Result<Document, RepositoryError>>;

  /**
   * Makes the content of a document readable on the device and says where. The adapter downloads
   * it to private storage, so the location stays valid offline, and may reuse an earlier download.
   * Calling it twice for the same document is safe.
   */
  fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>>;
}
