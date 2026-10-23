import { useQuery } from '@tanstack/react-query';

import type { Loaded } from '@core/application/offline/Loaded';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { unwrapResult } from '@core/presentation/query/QueryFailure';
import { useSessionOpen } from '@features/auth/presentation/state/useSessionOpen';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';

import { meetingsQueryKeys } from '../query/meetingsQueryKeys';
import { useMeetingsServices } from '../services/MeetingsServices';

/**
 * One meeting with its agenda, documents and participants, and where it comes from (the server,
 * or the copy saved on the device). Calls the `GetMeeting` use case and turns its `Result` into
 * query state the way `QueryFailure` says.
 */
export function useMeeting(meetingId: MeetingId) {
  const { getMeeting } = useMeetingsServices();
  const open = useSessionOpen();

  return useQuery<Loaded<Meeting>, Error>({
    queryKey: meetingsQueryKeys.detail(meetingId),
    queryFn: async () => unwrapResult(await getMeeting.execute({ meetingId })),
    enabled: open,
  });
}
