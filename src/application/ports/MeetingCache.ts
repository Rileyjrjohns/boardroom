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
 * - `purge` removes every entry of every owner, and succeeds when there is none.
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
