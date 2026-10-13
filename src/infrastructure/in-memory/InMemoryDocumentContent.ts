import type { StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';

/**
 * The files of the documents downloaded to the private storage of the device, as far as the
 * simulation goes: which locations hold content. The repository puts a download here, the cache
 * reads it to know whether an entry still points at something, and deletes from it when it drops
 * an entry (a confidential file must not outlive its entry). Shared by the two, like a folder.
 */
export class InMemoryDocumentContent {
  private readonly stored = new Set<DocumentLocation>();
  private deletionFailure: StorageWriteFailedError | undefined;

  /**
   * Makes every deletion fail with this error while set, as a locked file would. For tests.
   */
  failDeletionWith(failure: StorageWriteFailedError | undefined): void {
    this.deletionFailure = failure;
  }

  /** Content has been downloaded to this location. Storing it again changes nothing. */
  store(location: DocumentLocation): void {
    this.stored.add(location);
  }

  has(location: DocumentLocation): boolean {
    return this.stored.has(location);
  }

  /** The file is gone. Deleting what is not there succeeds. Fails while deletions are made to fail. */
  delete(location: DocumentLocation): Result<void, StorageWriteFailedError> {
    if (this.deletionFailure !== undefined) return err(this.deletionFailure);
    this.stored.delete(location);
    return ok(undefined);
  }
}
