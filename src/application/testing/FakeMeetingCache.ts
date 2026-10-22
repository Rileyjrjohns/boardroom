import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { StorageReadFailedError, StorageWriteFailedError } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { MeetingId, UserId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import type { Page } from '@domain/value-objects/Page';

import type { CacheEntry } from '../ports/types/CacheEntry';
import type { MeetingCache, MeetingPageKey } from '../ports/MeetingCache';

import { copyPlain } from './copyPlain';

/**
 * An in-memory cache that keeps the entries of each owner apart, like the contract says. A miss
 * is `ok(undefined)`. It keeps copies of what it is given and hands back copies of what it holds.
 */
export class FakeMeetingCache implements MeetingCache {
  /** Makes the reads fail while set. */
  readFailure: StorageReadFailedError | undefined;
  /**
   * Makes the saves fail while set. Nothing new is stored, and the older entry under the same key
   * is dropped, as the port requires: it must not stay readable as if it were current.
   */
  writeFailure: StorageWriteFailedError | undefined;
  /** Makes `removePage` and `removeMeeting` fail while set (the entry stays). */
  removeFailure: StorageWriteFailedError | undefined;
  /** Makes `purge` fail while set (the entries stay). */
  purgeFailure: StorageWriteFailedError | undefined;

  purgeCalls = 0;

  private readonly pages = new Map<string, CacheEntry<Page<MeetingSummary>>>();
  private readonly meetings = new Map<string, CacheEntry<Meeting>>();

  /** True when nothing is stored for anybody. */
  isEmpty(): boolean {
    return this.pages.size === 0 && this.meetings.size === 0;
  }

  savePage(
    owner: UserId,
    key: MeetingPageKey,
    page: Page<MeetingSummary>,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    if (this.writeFailure !== undefined) {
      this.pages.delete(pageKey(owner, key));
      return Promise.resolve(err(this.writeFailure));
    }
    this.pages.set(pageKey(owner, key), copyPlain({ value: page, cachedAt }));
    return Promise.resolve(ok(undefined));
  }

  readPage(
    owner: UserId,
    key: MeetingPageKey,
  ): Promise<Result<CacheEntry<Page<MeetingSummary>> | undefined, StorageReadFailedError>> {
    if (this.readFailure !== undefined) return Promise.resolve(err(this.readFailure));
    return Promise.resolve(ok(copyPlain(this.pages.get(pageKey(owner, key)))));
  }

  removePage(owner: UserId, key: MeetingPageKey): Promise<Result<void, StorageWriteFailedError>> {
    if (this.removeFailure !== undefined) return Promise.resolve(err(this.removeFailure));
    this.pages.delete(pageKey(owner, key));
    return Promise.resolve(ok(undefined));
  }

  saveMeeting(
    owner: UserId,
    meeting: Meeting,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    if (this.writeFailure !== undefined) {
      this.meetings.delete(meetingKey(owner, meeting.id));
      return Promise.resolve(err(this.writeFailure));
    }
    this.meetings.set(meetingKey(owner, meeting.id), copyPlain({ value: meeting, cachedAt }));
    return Promise.resolve(ok(undefined));
  }

  readMeeting(
    owner: UserId,
    id: MeetingId,
  ): Promise<Result<CacheEntry<Meeting> | undefined, StorageReadFailedError>> {
    if (this.readFailure !== undefined) return Promise.resolve(err(this.readFailure));
    return Promise.resolve(ok(copyPlain(this.meetings.get(meetingKey(owner, id)))));
  }

  removeMeeting(owner: UserId, id: MeetingId): Promise<Result<void, StorageWriteFailedError>> {
    if (this.removeFailure !== undefined) return Promise.resolve(err(this.removeFailure));
    this.meetings.delete(meetingKey(owner, id));
    return Promise.resolve(ok(undefined));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    this.purgeCalls += 1;
    if (this.purgeFailure !== undefined) return Promise.resolve(err(this.purgeFailure));
    this.pages.clear();
    this.meetings.clear();
    return Promise.resolve(ok(undefined));
  }
}

// JSON keeps the parts apart whatever characters the ids contain.
function pageKey(owner: UserId, { period, cursor, limit }: MeetingPageKey): string {
  return JSON.stringify([owner, period, cursor ?? null, limit]);
}

function meetingKey(owner: UserId, id: MeetingId): string {
  return JSON.stringify([owner, id]);
}
