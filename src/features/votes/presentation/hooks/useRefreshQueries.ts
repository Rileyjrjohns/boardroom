import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { MeetingId } from '@core/domain/value-objects/ids';
import { queryKeys } from '@core/presentation/query/queryKeys';

/**
 * What an action makes stale, by key, through the key factory. Each function marks the queries as
 * stale and asks again for the ones a screen is showing, and its promise settles when they have
 * answered, so that a button stays busy until the screen shows the outcome. A query nobody shows
 * is only marked: it is asked for when a screen needs it. Nothing is written to the cache by hand:
 * what the screen shows afterwards is what the use cases answer.
 */
export function useRefreshQueries() {
  const queryClient = useQueryClient();

  return useMemo(
    () => ({
      /** The outbox: a vote was queued, sent, rejected or acknowledged. */
      pendingVotes: () => queryClient.invalidateQueries({ queryKey: queryKeys.votes.pending() }),
      /** One meeting: a vote was recorded on it, or refused. */
      meeting: (meetingId: MeetingId) =>
        queryClient.invalidateQueries({ queryKey: queryKeys.meetings.detail(meetingId) }),
      /** Every meeting held: a synchronisation recorded votes on some of them. */
      meetings: () => queryClient.invalidateQueries({ queryKey: queryKeys.meetings.details() }),
    }),
    [queryClient],
  );
}
