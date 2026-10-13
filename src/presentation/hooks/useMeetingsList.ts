import { useInfiniteQuery } from '@tanstack/react-query';

import type { ValidationError } from '@domain/errors/ValidationError';
import { andThenAsync } from '@domain/shared/Result';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import type { PageCursor } from '@domain/value-objects/PageCursor';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import type { ListMeetingsError } from '@application/use-cases/meetings/ListMeetings';

import { queryKeys } from '../query/queryKeys';
import { QueryFailure, unwrapResult } from '../query/QueryFailure';
import { useAppServices } from '../services/AppServices';

import { selectMeetingsListView } from './meetingPages';
import type { MeetingsListView, MeetingsPage, MeetingsPages } from './meetingPages';

/** Why a page of the list could not be had: the use case's errors, or a page size the domain refuses. */
type MeetingsListFailure = QueryFailure<ListMeetingsError | ValidationError>;

/**
 * The meetings of a period, a page at a time. The query function calls the `ListMeetings` use
 * case, never an adapter, and turns its `Result` into query state the way `QueryFailure` says: a
 * failure is thrown, a success is the page. The cursor of a page is the page parameter of the next
 * one, and a page without a cursor ends the list.
 */
export function useMeetingsList(period: MeetingPeriod) {
  const { useCases, settings } = useAppServices();

  return useInfiniteQuery<
    MeetingsPage,
    MeetingsListFailure,
    MeetingsListView,
    ReturnType<typeof queryKeys.meetings.list>,
    PageCursor | undefined
  >({
    queryKey: queryKeys.meetings.list(period, settings.meetingsPageSize),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) =>
      unwrapResult(
        await andThenAsync(
          createPageRequest({
            limit: settings.meetingsPageSize,
            ...(pageParam === undefined ? {} : { cursor: pageParam }),
          }),
          (request) => useCases.listMeetings.execute({ period, request }),
        ),
      ),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor,
    select: (pages: MeetingsPages) => selectMeetingsListView(pages),
  });
}
