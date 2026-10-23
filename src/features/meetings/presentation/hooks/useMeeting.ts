import { useQuery } from '@tanstack/react-query';

import { useAppServices } from '@composition/shell/services/AppServices';
import { useSessionOpen } from '@composition/shell/state/useSessionOpen';
import type { Loaded } from '@core/application/offline/Loaded';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { unwrapResult } from '@core/presentation/query/QueryFailure';
import { queryKeys } from '@core/presentation/query/queryKeys';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';

/**
 * One meeting with its agenda, documents and participants, and where it comes from (the server,
 * or the copy saved on the device). Calls the `GetMeeting` use case and turns its `Result` into
 * query state the way `QueryFailure` says.
 */
export function useMeeting(meetingId: MeetingId) {
  const { useCases } = useAppServices();
  const open = useSessionOpen();

  return useQuery<Loaded<Meeting>, Error>({
    queryKey: queryKeys.meetings.detail(meetingId),
    queryFn: async () => unwrapResult(await useCases.getMeeting.execute({ meetingId })),
    enabled: open,
  });
}
