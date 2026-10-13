import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import type { Result } from '@domain/shared/Result';
import type { MeetingId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { Page } from '@domain/value-objects/Page';
import type { PageCursor } from '@domain/value-objects/PageCursor';

import type { CacheEntry } from './CacheEntry';

/**
 * Identifies a cached page of a list: the period, where the page starts (the first page has no
 * cursor) and the page size. A cursor only means something with the page size that produced it,
 * so the size is part of the key.
 */
export interface MeetingPageKey {
  readonly period: MeetingPeriod;
  readonly cursor?: PageCursor;
  readonly limit: number;
}

/**
 * The local store that lets meetings already seen be read offline.
 *
 * Every entry belongs to an `owner`, the user whose session fetched it, and every operation takes
 * the owner: an entry is stored under it and found under it only. Reading as another user finds
 * nothing, by construction, so a device shared by two users never shows the data of one to the
 * other. The data of an owner is removed when they sign out (`purge`).
 *
 * Contract:
 * - No method throws or rejects. Only a store that cannot be read or written returns a storage
 *   error. Every method settles in bounded time; a store that does not answer in time is a
 *   storage error.
 * - A read that finds nothing is not an error: it returns `undefined` as the value of a successful
 *   result (a miss).
 * - `save` replaces what is stored under the same owner and key. `remove` of an absent entry
 *   succeeds. Both are idempotent.
 * - A `save` that fails must not leave an older entry readable as if it were current: the older
 *   entry is removed (or never left in place) before the error is returned, so the next read is a
 *   miss. The application removes the entry itself after a failed write, and empties the caches
 *   when it cannot; this is the rule for the adapter, which does not depend on that.
 * - `purge` removes every entry of every owner, and succeeds when there is none.
 * - The storage key is injective in (owner, id): owners and ids are free text, so they are encoded
 *   (JSON, length prefixes, a separate column), never concatenated with a separator and never
 *   normalised (no trimming, no case folding, no Unicode normalisation). Two different pairs never
 *   share an entry, whatever characters they contain. The same goes for the parts of a page key
 *   (period, cursor, page size).
 * - The data is at rest on the device: it lives in app-private storage, excluded from backups.
 *   What is given to `save` and what is returned are copies, never shared with the store.
 */
export interface MeetingCache {
  savePage(
    owner: UserId,
    key: MeetingPageKey,
    page: Page<MeetingSummary>,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>>;

  /** `undefined` when the page was never cached for this owner. */
  readPage(
    owner: UserId,
    key: MeetingPageKey,
  ): Promise<Result<CacheEntry<Page<MeetingSummary>> | undefined, StorageReadFailedError>>;

  removePage(owner: UserId, key: MeetingPageKey): Promise<Result<void, StorageWriteFailedError>>;

  saveMeeting(
    owner: UserId,
    meeting: Meeting,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>>;

  /** `undefined` when the meeting was never cached for this owner. */
  readMeeting(
    owner: UserId,
    id: MeetingId,
  ): Promise<Result<CacheEntry<Meeting> | undefined, StorageReadFailedError>>;

  removeMeeting(owner: UserId, id: MeetingId): Promise<Result<void, StorageWriteFailedError>>;

  /** Removes every entry of every owner. */
  purge(): Promise<Result<void, StorageWriteFailedError>>;
}
