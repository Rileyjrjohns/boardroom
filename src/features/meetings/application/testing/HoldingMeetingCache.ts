import type { CacheEntry } from '@core/application/ports/types/CacheEntry';
import type {
  StorageReadFailedError,
  StorageWriteFailedError,
} from '@core/domain/errors/StorageError';
import type { Result } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { Page } from '@core/domain/value-objects/Page';
import type { MeetingId, UserId } from '@core/domain/value-objects/ids';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';

import type { MeetingCache, MeetingPageKey } from '../ports/MeetingCache';

/** What a test does with a read that is held. */
export interface HeldRead {
  /** Resolves once the storage has answered the read and the answer is being held back. */
  readonly hasAnswered: Promise<void>;
  /** Lets the answer through to the caller. */
  readonly release: () => void;
}

/**
 * A cache of meetings with a slow storage in front of it, for a test of what happens between two
 * statements: once `holdNextRead` is called, the next read of a meeting runs on the real cache,
 * then waits to be released before it answers. The app, meanwhile, moves on (a sign-out, say).
 * Everything else goes straight to the cache it wraps.
 */
export class HoldingMeetingCache implements MeetingCache {
  private holding: { readonly gate: Promise<void>; readonly answered: () => void } | undefined;

  constructor(private readonly inner: MeetingCache) {}

  holdNextRead(): HeldRead {
    let release: () => void = () => undefined;
    let answered: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hasAnswered = new Promise<void>((resolve) => {
      answered = resolve;
    });
    this.holding = { gate, answered };
    return { hasAnswered, release: () => release() };
  }

  async readMeeting(
    owner: UserId,
    id: MeetingId,
  ): Promise<Result<CacheEntry<Meeting> | undefined, StorageReadFailedError>> {
    const answer = await this.inner.readMeeting(owner, id);
    const held = this.holding;
    this.holding = undefined;
    if (held !== undefined) {
      held.answered();
      await held.gate;
    }
    return answer;
  }

  savePage(
    owner: UserId,
    key: MeetingPageKey,
    page: Page<MeetingSummary>,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.inner.savePage(owner, key, page, cachedAt);
  }

  readPage(
    owner: UserId,
    key: MeetingPageKey,
  ): Promise<Result<CacheEntry<Page<MeetingSummary>> | undefined, StorageReadFailedError>> {
    return this.inner.readPage(owner, key);
  }

  removePage(owner: UserId, key: MeetingPageKey): Promise<Result<void, StorageWriteFailedError>> {
    return this.inner.removePage(owner, key);
  }

  saveMeeting(
    owner: UserId,
    meeting: Meeting,
    cachedAt: Instant,
  ): Promise<Result<void, StorageWriteFailedError>> {
    return this.inner.saveMeeting(owner, meeting, cachedAt);
  }

  removeMeeting(owner: UserId, id: MeetingId): Promise<Result<void, StorageWriteFailedError>> {
    return this.inner.removeMeeting(owner, id);
  }

  purge(): Promise<Result<void, StorageWriteFailedError>> {
    return this.inner.purge();
  }
}
