import type { CacheEntry } from '@core/application/ports/types/CacheEntry';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { Page } from '@core/domain/value-objects/Page';
import type { MeetingId, UserId } from '@core/domain/value-objects/ids';
import { clonePlain } from '@core/infrastructure/shared/clonePlain';
import type {
  MeetingCache,
  MeetingPageKey,
} from '@features/meetings/application/ports/MeetingCache';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';

/**
 * A meeting cache in memory, for the mock configuration and as the reference the contract tests
 * run against. Every entry belongs to its owner and is found under it only. What it is given and
 * what it hands back are copies, so nobody holds a reference into the store. It lives as long as
 * the process: the persistent adapter arrives with the SQLite step.
 */
export class InMemoryMeetingCache implements MeetingCache {
  private readonly pages = new Map<string, CacheEntry<Page<MeetingSummary>>>();
  private readonly meetings = new Map<string, CacheEntry<Meeting>>();
  private writeFailure: StorageWriteFailedError | undefined;

  /**
   * Makes every save fail with this error while set, as a full disk would. A save that fails drops
   * the older entry under the same key, as the port requires. For tests.
   */
  failWritesWith(failure: StorageWriteFailedError | undefined): void {
    this.writeFailure = failure;
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
    this.pages.set(pageKey(owner, key), clonePlain({ value: page, cachedAt }));
    return Promise.resolve(ok(undefined));
  }

  readPage(
    owner: UserId,
    key: MeetingPageKey,
  ): Promise<Result<CacheEntry<Page<MeetingSummary>> | undefined, StorageReadFailedError>> {
    return Promise.resolve(ok(copyOf(this.pages.get(pageKey(owner, key)))));
  }

  removePage(owner: UserId, key: MeetingPageKey): Promise<Result<void, StorageWriteFailedError>> {
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
    this.meetings.set(meetingKey(owner, meeting.id), clonePlain({ value: meeting, cachedAt }));
    return Promise.resolve(ok(undefined));
  }

  readMeeting(
    owner: UserId,
    id: MeetingId,
  ): Promise<Result<CacheEntry<Meeting> | undefined, StorageReadFailedError>> {
    return Promise.resolve(ok(copyOf(this.meetings.get(meetingKey(owner, id)))));
  }

  removeMeeting(owner: UserId, id: MeetingId): Promise<Result<void, StorageWriteFailedError>> {
    this.meetings.delete(meetingKey(owner, id));
    return Promise.resolve(ok(undefined));
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    this.pages.clear();
    this.meetings.clear();
    return Promise.resolve(ok(undefined));
  }
}

function copyOf<T>(entry: CacheEntry<T> | undefined): CacheEntry<T> | undefined {
  return entry === undefined ? undefined : clonePlain(entry);
}

// JSON keeps the parts apart whatever characters the ids contain.
function pageKey(owner: UserId, { period, cursor, limit }: MeetingPageKey): string {
  return JSON.stringify([owner, period, cursor ?? null, limit]);
}

function meetingKey(owner: UserId, id: MeetingId): string {
  return JSON.stringify([owner, id]);
}
