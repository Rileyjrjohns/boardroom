import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import type { CacheEntry } from '@application/ports/CacheEntry';
import type { DocumentCache, ViewableDocument } from '@application/ports/DocumentCache';

import { clonePlain } from '../shared/clonePlain';

import type { InMemoryDocumentContent } from './InMemoryDocumentContent';

/**
 * A document cache in memory. It keeps the metadata and the location of each document per owner,
 * and answers for the content through the files of the device (`InMemoryDocumentContent`): an
 * entry whose content is gone is a miss, and dropping an entry deletes its content, first, so that
 * a file that cannot be deleted keeps its entry and the call fails instead of reporting a deletion
 * that did not happen. Two owners may point at the same file; it is deleted only when the last
 * entry that points at it is dropped, so one user signing out cannot take the file from another.
 */
export class InMemoryDocumentCache implements DocumentCache {
  private readonly entries = new Map<string, CacheEntry<ViewableDocument>>();
  private writeFailure: StorageWriteFailedError | undefined;

  constructor(private readonly content: InMemoryDocumentContent) {}

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
    const key = entryKey(owner, viewable.document.id);
    if (this.writeFailure !== undefined) {
      this.entries.delete(key);
      return Promise.resolve(err(this.writeFailure));
    }

    // An entry that moves to another location leaves its previous content behind, unless another
    // entry still points at it: nothing may stay on the device with nothing pointing at it.
    const previous = this.entries.get(key);
    if (previous !== undefined && previous.value.location !== viewable.location) {
      const deleted = this.deleteContentOf(key, previous.value.location);
      if (isErr(deleted)) {
        this.entries.delete(key);
        return Promise.resolve(deleted);
      }
    }
    this.entries.set(key, clonePlain({ value: viewable, cachedAt }));
    return Promise.resolve(ok(undefined));
  }

  read(
    owner: UserId,
    id: DocumentId,
  ): Promise<Result<CacheEntry<ViewableDocument> | undefined, StorageReadFailedError>> {
    const entry = this.entries.get(entryKey(owner, id));
    if (entry === undefined || !this.content.has(entry.value.location)) {
      return Promise.resolve(ok(undefined));
    }
    return Promise.resolve(ok(clonePlain(entry)));
  }

  remove(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>> {
    const key = entryKey(owner, id);
    const entry = this.entries.get(key);
    if (entry === undefined) return Promise.resolve(ok(undefined));

    const deleted = this.deleteContentOf(key, entry.value.location);
    if (isErr(deleted)) return Promise.resolve(deleted);
    this.entries.delete(key);
    return Promise.resolve(ok(undefined));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    for (const [key, entry] of [...this.entries]) {
      const deleted = this.deleteContentOf(key, entry.value.location);
      if (isErr(deleted)) return Promise.resolve(deleted);
      this.entries.delete(key);
    }
    return Promise.resolve(ok(undefined));
  }

  /** Deletes the file of an entry, unless another entry still points at it. */
  private deleteContentOf(
    key: string,
    location: DocumentLocation,
  ): Result<void, StorageWriteFailedError> {
    const shared = [...this.entries].some(
      ([otherKey, other]) => otherKey !== key && other.value.location === location,
    );
    return shared ? ok(undefined) : this.content.delete(location);
  }
}

// JSON keeps the parts apart whatever characters the ids contain.
function entryKey(owner: UserId, id: DocumentId): string {
  return JSON.stringify([owner, id]);
}
