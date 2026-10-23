import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { andThenAsync } from '@core/domain/shared/Result';
import type { PageCursor } from '@core/domain/value-objects/PageCursor';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import { unwrapResult } from '@core/presentation/query/QueryFailure';
import { useSessionOpen } from '@features/auth/presentation/state/useSessionOpen';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

import { meetingsQueryKeys } from '../query/meetingsQueryKeys';
import { useMeetingsServices } from '../services/MeetingsServices';

import { selectMeetingsListView } from './meetingPages';
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
  const { listMeetings, pageSize } = useMeetingsServices();
  const queryClient = useQueryClient();
  const open = useSessionOpen();
  const queryKey = useMemo(() => meetingsQueryKeys.list(period, pageSize), [period, pageSize]);

  const query = useInfiniteQuery<
    MeetingsPage,
    Error,
    MeetingsListView,
    ReturnType<typeof meetingsQueryKeys.list>,
    PageCursor | undefined
  >({
    queryKey,
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      unwrapResult(
        await andThenAsync(
          createPageRequest({
            limit: pageSize,
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          }),
          (request) => listMeetings.execute({ period, request }),
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
