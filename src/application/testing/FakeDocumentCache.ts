import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';

import type { CacheEntry } from '../ports/CacheEntry';
import type { DocumentCache, ViewableDocument } from '../ports/DocumentCache';

import { copyPlain } from './copyPlain';

/**
 * An in-memory cache that keeps the entries of each owner apart, like the contract says. A miss
 * is `ok(undefined)`. It keeps copies of what it is given and hands back copies of what it holds.
 * It keeps no files: it cannot lose a content, nor delete one.
 */
export class FakeDocumentCache implements DocumentCache {
  /** Makes the reads fail while set. */
  readFailure: StorageReadFailedError | undefined;
  /** Makes `save` fail while set (nothing is stored). */
  writeFailure: StorageWriteFailedError | undefined;
  /** Makes `remove` fail while set (the entry stays). */
  removeFailure: StorageWriteFailedError | undefined;
  /** Makes `purge` fail while set (the entries stay). */
  purgeFailure: StorageWriteFailedError | undefined;

  purgeCalls = 0;

  private readonly entries = new Map<string, CacheEntry<ViewableDocument>>();

  /** True when nothing is stored for anybody. */
  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  save(
    owner: UserId,
    viewable: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    if (this.writeFailure !== undefined) return Promise.resolve(err(this.writeFailure));
    this.entries.set(
      entryKey(owner, viewable.document.id),
      copyPlain({ value: viewable, cachedAt }),
    );
    return Promise.resolve(ok(undefined));
  }

  read(
    owner: UserId,
    id: DocumentId,
  ): Promise<Result<CacheEntry<ViewableDocument> | undefined, StorageReadFailedError>> {
    if (this.readFailure !== undefined) return Promise.resolve(err(this.readFailure));
    return Promise.resolve(ok(copyPlain(this.entries.get(entryKey(owner, id)))));
  }

  remove(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>> {
    if (this.removeFailure !== undefined) return Promise.resolve(err(this.removeFailure));
    this.entries.delete(entryKey(owner, id));
    return Promise.resolve(ok(undefined));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    this.purgeCalls += 1;
    if (this.purgeFailure !== undefined) return Promise.resolve(err(this.purgeFailure));
    this.entries.clear();
    return Promise.resolve(ok(undefined));
  }
}

// JSON keeps the parts apart whatever characters the ids contain.
function entryKey(owner: UserId, id: DocumentId): string {
  return JSON.stringify([owner, id]);
}
