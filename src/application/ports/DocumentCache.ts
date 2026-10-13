import type { Document } from '@domain/entities/Document';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { Result } from '@domain/shared/Result';
import type { DocumentLocation } from '@domain/value-objects/DocumentLocation';
import type { DocumentId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';

import type { CacheEntry } from './CacheEntry';

/** A document that can be shown: its metadata and where its content is. */
export interface ViewableDocument {
  readonly document: Document;
  readonly location: DocumentLocation;
}

/**
 * The local store that lets documents already viewed be opened offline. It keeps the metadata and
 * the location of the content; the content itself stays where the location points, in storage the
 * adapter owns.
 *
 * Every entry belongs to an `owner`, the user whose session fetched it, and every operation takes
 * the owner: reading as another user finds nothing, by construction (see `MeetingCache`).
 *
 * Contract:
 * - No method throws or rejects. Only a store that cannot be read or written returns a storage
 *   error. Every method settles in bounded time; a store that does not answer in time is a storage
 *   error.
 * - A read that finds nothing returns `undefined` as the value of a successful result (a miss),
 *   not an error. It is also a miss when the entry is there but the stored content is gone (the
 *   file was deleted, the storage was cleared): a location that points nowhere is never returned.
 * - `save` replaces what is stored for the same owner and document. `remove` of an absent entry
 *   succeeds. Both are idempotent.
 * - `remove` and `purge` also delete the stored content, not only the entry: a confidential file
 *   must not outlive its entry. `purge` removes every entry of every owner. The content is deleted
 *   first, then the entry: if the content cannot be deleted, the call returns a storage error and
 *   reports nothing as deleted (the entry stays, so the call can be repeated); an entry is never
 *   dropped while its file is left behind with nothing pointing at it. The files that no entry
 *   points at (a download whose entry was never saved, a deletion that was interrupted) are swept
 *   when the cache starts.
 * - Several entries may point at the same location (two owners, one file). The file is deleted
 *   only when the last entry that points at it is dropped, so that removing the entry of one owner
 *   never takes the file from another. Adapters count the references, or keep one file per owner.
 * - A `save` that fails must not leave an older entry readable as if it were current (see
 *   `MeetingCache`).
 * - The storage key is injective in (owner, document id): free text, encoded, never concatenated
 *   and never normalised (see `MeetingCache`).
 * - The content lives in app-private storage, excluded from backups (no iCloud, no Auto Backup),
 *   and is encrypted at rest where the platform offers it.
 */
export interface DocumentCache {
  save(
    owner: UserId,
    viewable: ViewableDocument,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>>;

  /** `undefined` when the document was never viewed by this owner, or its content is gone. */
  read(
    owner: UserId,
    id: DocumentId,
  ): Promise<Result<CacheEntry<ViewableDocument> | undefined, StorageReadFailedError>>;

  remove(owner: UserId, id: DocumentId): Promise<Result<void, StorageWriteFailedError>>;

  /** Removes every entry of every owner, and the content they point to. */
  purge(): Promise<Result<void, StorageWriteFailedError>>;
}
