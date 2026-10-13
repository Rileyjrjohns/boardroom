import { aMeetingSummary, aMeetingId, at } from '@domain/testing/builders';
import { createPage } from '@domain/value-objects/Page';
import { FRESHNESS } from '@application/shared/Loaded';

import { selectMeetingsListView } from './meetingPages';
import type { MeetingsPage, MeetingsPages } from './meetingPages';

const first = aMeetingSummary({ id: aMeetingId('a') });
const second = aMeetingSummary({ id: aMeetingId('b') });
const third = aMeetingSummary({ id: aMeetingId('c') });

const fresh = (...meetings: (typeof first)[]): MeetingsPage => ({
  data: createPage(meetings),
  source: { freshness: FRESHNESS.Fresh },
  loadedAt: at(0),
});
const stale = (cachedAt: number, ...meetings: (typeof first)[]): MeetingsPage => ({
  data: createPage(meetings),
  source: { freshness: FRESHNESS.Stale, cachedAt: at(cachedAt) },
  loadedAt: at(0),
});
const pagesOf = (...pages: MeetingsPage[]): MeetingsPages => ({
  pages,
  pageParams: pages.map(() => undefined),
});

describe('selectMeetingsListView', () => {
  it('joins the meetings of every page, in the order of the pages', () => {
    const view = selectMeetingsListView(pagesOf(fresh(first, second), fresh(third)));

    expect(view.meetings).toEqual([first, second, third]);
  });

  it('has no stale instant while every page comes from the server', () => {
    expect(selectMeetingsListView(pagesOf(fresh(first), fresh(second))).staleSince).toBeUndefined();
  });

  it('says since when a page is a saved copy', () => {
    expect(selectMeetingsListView(pagesOf(stale(-500, first))).staleSince).toBe(at(-500));
  });

  it('says since when the oldest saved page was cached, once any page is a saved copy', () => {
    const view = selectMeetingsListView(
      pagesOf(stale(-100, first), fresh(second), stale(-900, third), stale(-300, first)),
    );

    expect(view.staleSince).toBe(at(-900));
  });

  it('has nothing to show for no page', () => {
    expect(selectMeetingsListView(pagesOf())).toEqual({ meetings: [], staleSince: undefined });
  });
});
