import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { unexpected } from '@core/domain/errors/RepositoryError';
import type { UnexpectedError } from '@core/domain/errors/RepositoryError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { DocumentId, UserId } from '@core/domain/value-objects/ids';
import type { FileStore } from '@core/infrastructure/files/FileStore';
import { sha256Hex } from '@core/infrastructure/shared/sha256';
import { parseDocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';

/** The extension of the files of the documents. */
const FILE_EXTENSION = '.pdf';

/** The `cause` of the error a download that could not be kept becomes. */
const NOT_STORED_CAUSE = 'content not stored';

/** What the monitoring is told the content was, when it could not be written. */
const CONTENT_RESOURCE = 'documentContent';

/**
 * The name of the file that holds the content of a document for a user, in a version. It is the
 * digest of the three, so:
 *
 * - two users never share a file, and a new version never reuses the file of the one before:
 *   downloading is the only way a file comes to exist, and it is named for who it was downloaded
 *   for and which version it is;
 * - the same triple always gives the same name, so asking for the same content twice says the
 *   same place;
 * - the name is short and made of hexadecimal digits, which every file system accepts and which
 *   cannot collide with another name by case, by a separator or by the way a character is written,
 *   whatever the identifiers contain (they are free text); and it tells nothing of the user nor
 *   the document to anyone who lists the directory.
 *
 * The parts go through JSON so that they are never joined in one text: `["a|b","c"]` and
 * `["a","b|c"]` are two names.
 */
export function documentFileName(owner: UserId, id: DocumentId, version: string): string {
  return `${sha256Hex(JSON.stringify([owner, id, version]))}${FILE_EXTENSION}`;
}

export interface DownloadedDocument {
  /** The user the content was downloaded for. */
  readonly userId: UserId;
  readonly documentId: DocumentId;
  /** Identifies the version of the content (the `ETag` of the API). */
  readonly version: string;
  readonly bytes: Uint8Array;
}

export interface StoreDocumentContentDeps {
  readonly files: FileStore;
  readonly monitoring: Monitoring;
}

/**
 * Keeps a download: writes it whole or not at all to the file of its user, document and version,
 * and says where it is. Both repositories, the HTTP one and the in-memory one, end their
 * `fetchContent` here, so the two configurations name and keep the files the same way. The same
 * download again replaces the file with what it has just fetched.
 *
 * A file that cannot be written is `unexpected` for the caller, with a cause that is a kind of
 * failure and nothing else, and the monitoring is told with the code the file system gave: never a
 * path, a name or the title.
 */
export async function storeDocumentContent(
  { files, monitoring }: StoreDocumentContentDeps,
  download: DownloadedDocument,
): Promise<Result<DocumentLocation, UnexpectedError>> {
  const name = documentFileName(download.userId, download.documentId, download.version);
  const written = await files.write(name, download.bytes);
  if (!written.ok) {
    monitoring.captureError(
      MONITORING_EVENT.DocumentContentNotStored,
      storageWriteFailed(written.error.cause),
      {
        [LOG_ATTRIBUTE.Resource]: CONTENT_RESOURCE,
        [LOG_ATTRIBUTE.DocumentId]: download.documentId,
      },
    );
    return err(unexpected(NOT_STORED_CAUSE));
  }

  const location = parseDocumentLocation(files.uriOf(name));
  return location.ok ? ok(location.value) : err(unexpected(NOT_STORED_CAUSE));
}
