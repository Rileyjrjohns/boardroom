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
 * with the same rule for the `cause` of `unexpected`: never a path, a URL, a location, a title, a
 * name, an email or a vote choice. `unauthorized` means the session is no longer valid, and
 * `forbidden` that this user may not have this document (see `MeetingRepository`).
 */
export interface DocumentRepository {
  get(id: DocumentId): Promise<Result<Document, RepositoryError>>;

  /**
   * Makes the content of a document readable on the device and says where. The adapter downloads
   * it to app-private storage (excluded from backups), so the location stays valid offline.
   * Calling it twice for the same document is safe.
   *
   * A download may be reused only for the same signed-in user and the same version of the
   * document: the location is never the same for two users, and a new version of a document (its
   * content or its classification changed on the server) is downloaded again. Reusing a file for
   * another user would show them content they may not have, and reusing it across versions would
   * show content that has been withdrawn.
   */
  fetchContent(id: DocumentId): Promise<Result<DocumentLocation, RepositoryError>>;
}
