import type { InfiniteData } from '@tanstack/react-query';

import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { Instant } from '@domain/value-objects/Instant';
import type { Page } from '@domain/value-objects/Page';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import { FRESHNESS } from '@application/shared/Loaded';
import type { Loaded } from '@application/shared/Loaded';

/** One page of the list, with where it comes from. */
export type MeetingsPage = Loaded<Page<MeetingSummary>>;

/** The pages loaded so far, as the infinite query holds them. */
export type MeetingsPages = InfiniteData<MeetingsPage, PageCursor | undefined>;

/** What the list screen shows of the pages. */
export interface MeetingsListView {
  /** Every meeting of every page, in the order of the pages. */
  readonly meetings: readonly MeetingSummary[];
  /**
   * When the oldest saved page was cached, or `undefined` when every page comes from the server.
   * One saved page is enough to say that what is on the screen may be out of date, and the oldest
   * one says how far.
   */
  readonly staleSince: Instant | undefined;
}

/** Flattens the pages. A module-level function, so that the query memoises its result. */
export function selectMeetingsListView(pages: MeetingsPages): MeetingsListView {
  let staleSince: Instant | undefined;
  for (const { source } of pages.pages) {
    if (
      source.freshness === FRESHNESS.Stale &&
      (staleSince === undefined || source.cachedAt < staleSince)
    ) {
      staleSince = source.cachedAt;
    }
  }
  return { meetings: pages.pages.flatMap((page) => page.data.items), staleSince };
}
