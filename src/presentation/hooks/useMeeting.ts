import { useQuery } from '@tanstack/react-query';

import type { Meeting } from '@domain/entities/Meeting';
import type { MeetingId } from '@domain/value-objects/ids';
import type { Loaded } from '@application/shared/Loaded';

import { queryKeys } from '../query/queryKeys';
import { unwrapResult } from '../query/QueryFailure';
import { useAppServices } from '../services/AppServices';

/**
 * One meeting with its agenda, documents and participants, and where it comes from (the server,
 * or the copy saved on the device). Calls the `GetMeeting` use case and turns its `Result` into
 * query state the way `QueryFailure` says.
 */
export function useMeeting(meetingId: MeetingId) {
  const { useCases } = useAppServices();

  return useQuery<Loaded<Meeting>, Error>({
    queryKey: queryKeys.meetings.detail(meetingId),
    queryFn: async () => unwrapResult(await useCases.getMeeting.execute({ meetingId })),
  });
}
