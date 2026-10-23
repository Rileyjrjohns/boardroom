import { useQuery } from '@tanstack/react-query';

import { useAppServices } from '@composition/shell/services/AppServices';
import { useSessionOpen } from '@composition/shell/state/useSessionOpen';
import { unwrapResult } from '@core/presentation/query/QueryFailure';
import { queryKeys } from '@core/presentation/query/queryKeys';
import type { OutboxContent } from '@features/votes/application/use-cases/ListPendingVotes';

/**
 * The votes of the signed-in user in the outbox: the ones waiting to be sent and the rejected ones.
 * It is server state like any other, even though it is read from the device: it changes when a
 * vote is cast, when a synchronisation runs and when a rejected vote is acknowledged, and each of
 * those refreshes this key (see `useRefreshQueries`).
 */
export function usePendingVotes() {
  const { useCases } = useAppServices();
  const open = useSessionOpen();

  return useQuery<OutboxContent, Error>({
    queryKey: queryKeys.votes.pending(),
    queryFn: async () => unwrapResult(await useCases.listPendingVotes.execute()),
    enabled: open,
  });
}
