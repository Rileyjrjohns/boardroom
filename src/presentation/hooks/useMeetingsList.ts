import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { andThenAsync } from '@domain/shared/Result';

import { queryKeys } from '../query/queryKeys';
import { unwrapResult } from '../query/QueryFailure';
import { useAppServices } from '../services/AppServices';

import { selectMeetingsListView } from './meetingPages';
import { useSessionOpen } from './useSessionOpen';
import type { MeetingsListView, MeetingsPage, MeetingsPages } from './meetingPages';

/**
 * The meetings of a period, a page at a time. The query function calls the `ListMeetings` use
 * case, never an adapter, and turns its `Result` into query state the way `QueryFailure` says: a
 * failure is thrown, a success is the page. The cursor of a page is the page parameter of the next
 * one, and a page without a cursor ends the list.
 *
 * `restart` is what a pull to refresh and a retry call. Refetching an infinite query asks for
 * every page loaded, one after the other, which is a request per page for a list the user has
 * scrolled far down. The list is cut back to its first page first, and that one is asked for: the
 * user who pulls is at the top, and the next pages are asked for again as they scroll.
 */
export function useMeetingsList(period: MeetingPeriod) {
  const { useCases, settings } = useAppServices();
  const queryClient = useQueryClient();
  const open = useSessionOpen();
  const { meetingsPageSize } = settings;
  const queryKey = useMemo(
    () => queryKeys.meetings.list(period, meetingsPageSize),
    [period, meetingsPageSize],
  );

  const query = useInfiniteQuery<
    MeetingsPage,
    Error,
    MeetingsListView,
    ReturnType<typeof queryKeys.meetings.list>,
    PageCursor | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      unwrapResult(
        await andThenAsync(
          createPageRequest({
            limit: meetingsPageSize,
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          }),
          (request) => useCases.listMeetings.execute({ period, request }),
        ),
      ),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    // A reference that does not change between renders: the query keeps the result it computed
    // for the pages it holds, and only computes again when they change.
    select: selectMeetingsListView,
    enabled: open,
  });

  const { refetch } = query;
  const restart = useCallback(async () => {
    queryClient.setQueryData<MeetingsPages>(queryKey, (pages) =>
      pages === undefined
        ? undefined
        : { pages: pages.pages.slice(0, 1), pageParams: pages.pageParams.slice(0, 1) },
    );
    await refetch();
  }, [queryClient, queryKey, refetch]);

  return { ...query, restart };
}
