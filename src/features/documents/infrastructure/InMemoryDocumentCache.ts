import type { CacheEntry } from '@core/application/ports/types/CacheEntry';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { DocumentId, UserId } from '@core/domain/value-objects/ids';
import type { FileStore } from '@core/infrastructure/files/FileStore';
import { clonePlain } from '@core/infrastructure/shared/clonePlain';
import { createSerialQueue } from '@core/infrastructure/shared/serialQueue';
import type {
  DocumentCache,
  ViewableDocument,
} from '@features/documents/application/ports/DocumentCache';
import type { DocumentLocation } from '@features/documents/domain/value-objects/DocumentLocation';

import { contentExists, deleteContent } from './documentContent';

/**
 * A document cache whose entries are in memory and whose content is on the device, in the files of
 * the store: the cache of the mock configuration, which has no database. It keeps the metadata and
 * the location of each document per owner, and answers for the content through the files: an entry
 * whose content is gone is a miss, and dropping an entry deletes its content, first, so that a file
 * that cannot be deleted keeps its entry and the call fails instead of reporting a deletion that
 * did not happen. Two owners may point at the same file; it is deleted only when the last entry that
 * points at it is dropped, so one user signing out cannot take the file from another.
 *
 * The entries die with the app and the files do not, so the composition root empties the store when
 * it starts (`FileStore.deleteAll`): nothing may stay on the device with nothing pointing at it.
 * Calls run one at a time, in the order they were made.
 */
export class InMemoryDocumentCache implements DocumentCache {
  private readonly entries = new Map<string, CacheEntry<ViewableDocument>>();
  private readonly inOrder = createSerialQueue();
  private writeFailure: StorageWriteFailedError | undefined;

  constructor(private readonly files: FileStore) {}

  /**
   * Makes every save fail with this error while set, as a full disk would. A save that fails drops
   * the older entry for the same owner and document, as the port requires. For tests.
   */
  failWritesWith(failure: StorageWriteFailedError | undefined): void {
    this.writeFailure = failure;
  }

  save(
    owner: UserId,
    viewable: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(async () => {
      const key = entryKey(owner, viewable.document.id);
      if (this.writeFailure !== undefined) {
        await this.drop(key);
        return err(this.writeFailure);
      }

      // An entry that moves to another location leaves its previous content behind, unless another
      // entry still points at it: nothing may stay on the device with nothing pointing at it.
      const previous = this.entries.get(key);
      if (previous !== undefined && previous.value.location !== viewable.location) {
        const deleted = await this.deleteContentOf(key, previous.value.location);
        if (isErr(deleted)) {
          this.entries.delete(key);
          return deleted;
        }
      }
      this.entries.set(key, clonePlain({ value: viewable, cachedAt }));
      return ok(undefined);
    });
  }

  read(
    owner: UserId,
    id: DocumentId,
  ): Promise<Result<CacheEntry<ViewableDocument> | undefined, StorageReadFailedError>> {
    return this.inOrder(async () => {
      const entry = this.entries.get(entryKey(owner, id));
      if (entry === undefined) return ok(undefined);

      const present = await contentExists(this.files, entry.value.location);
      if (!present.ok) return err(storageReadFailed(present.error.cause));
      return ok(present.value ? clonePlain(entry) : undefined);
    });
  }

  remove(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(async () => {
      const key = entryKey(owner, id);
      const entry = this.entries.get(key);
      if (entry === undefined) return ok(undefined);

      const deleted = await this.deleteContentOf(key, entry.value.location);
      if (isErr(deleted)) return deleted;
      this.entries.delete(key);
      return ok(undefined);
    });
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    return this.inOrder(async () => {
      for (const [key, entry] of [...this.entries]) {
        const deleted = await this.deleteContentOf(key, entry.value.location);
        if (isErr(deleted)) return deleted;
        this.entries.delete(key);
      }
      // What no entry points at goes too: purging leaves nothing of any document on the device.
      const swept = await this.files.deleteAll();
      return swept.ok ? ok(undefined) : err(storageWriteFailed(swept.error.cause));
    });
  }

  /** Drops an entry and, best effort, its content. */
  private async drop(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry === undefined) return;
    this.entries.delete(key);
    await this.deleteContentOf(key, entry.value.location);
  }

  /** Deletes the file of an entry, unless another entry still points at it. */
  private async deleteContentOf(
    key: string,
    location: DocumentLocation,
  ): Promise<Result<void, StorageWriteFailedError>> {
    const shared = [...this.entries].some(
      ([otherKey, other]) => otherKey !== key && other.value.location === location,
    );
    if (shared) return ok(undefined);

    const deleted = await deleteContent(this.files, location);
    return deleted.ok ? ok(undefined) : err(storageWriteFailed(deleted.error.cause));
  }
}

// JSON keeps the parts apart whatever characters the ids contain.
function entryKey(owner: UserId, id: DocumentId): string {
  return JSON.stringify([owner, id]);
}
