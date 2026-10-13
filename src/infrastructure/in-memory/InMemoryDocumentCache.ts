import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import type { CacheEntry } from '@application/ports/CacheEntry';
import type { DocumentCache, ViewableDocument } from '@application/ports/DocumentCache';

import { clonePlain } from '../shared/clonePlain';

import type { InMemoryDocumentContent } from './InMemoryDocumentContent';

/**
 * A document cache in memory. It keeps the metadata and the location of each document per owner,
 * and answers for the content through the files of the device (`InMemoryDocumentContent`): an
 * entry whose content is gone is a miss, and dropping an entry deletes its content. Two owners
 * may point at the same file; it is deleted only when the last entry that points at it is dropped,
 * so one user signing out cannot take the file from another.
 */
export class InMemoryDocumentCache implements DocumentCache {
  private readonly entries = new Map<string, CacheEntry<ViewableDocument>>();

  constructor(private readonly content: InMemoryDocumentContent) {}

  save(
    owner: UserId,
    viewable: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    this.entries.set(
      entryKey(owner, viewable.document.id),
      clonePlain({ value: viewable, cachedAt }),
    );
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
    this.entries.delete(key);
    if (entry !== undefined && !this.isPointedAt(entry.value.location)) {
      this.content.delete(entry.value.location);
    }
    return Promise.resolve(ok(undefined));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    for (const entry of this.entries.values()) this.content.delete(entry.value.location);
    this.entries.clear();
    return Promise.resolve(ok(undefined));
  }

  private isPointedAt(location: ViewableDocument['location']): boolean {
    return [...this.entries.values()].some((entry) => entry.value.location === location);
  }
}

// JSON keeps the parts apart whatever characters the ids contain.
function entryKey(owner: UserId, id: DocumentId): string {
  return JSON.stringify([owner, id]);
}
