import { useQuery } from '@tanstack/react-query';

import { unwrapResult } from '@core/presentation/query/QueryFailure';
import { useSessionOpen } from '@features/auth/presentation/state/useSessionOpen';
import type { OutboxContent } from '@features/votes/application/use-cases/ListPendingVotes';

import { votesQueryKeys } from '../query/votesQueryKeys';
import { useVotesServices } from '../services/VotesServices';

/**
 * The votes of the signed-in user in the outbox: the ones waiting to be sent and the rejected ones.
 * It is server state like any other, even though it is read from the device: it changes when a
 * vote is cast, when a synchronisation runs and when a rejected vote is acknowledged, and each of
 * those refreshes this key (see `useRefreshQueries`).
 */
export function usePendingVotes() {
  const { listPendingVotes } = useVotesServices();
  const open = useSessionOpen();

  return useQuery<OutboxContent, Error>({
    queryKey: votesQueryKeys.pending(),
    queryFn: async () => unwrapResult(await listPendingVotes.execute()),
    enabled: open,
  });
}
