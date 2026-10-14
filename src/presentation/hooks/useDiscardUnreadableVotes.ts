import type { DiscardUnreadableVotesError } from '@application/use-cases/votes/DiscardUnreadableVotes';

import { useResultMutation } from '../query/useResultMutation';
import { useAppServices } from '../services/AppServices';

import { useRefreshQueries } from './useRefreshQueries';

/**
 * Discards the entries of the outbox that can no longer be read as a vote, on the user's request.
 * The outbox is asked again afterwards, which makes the notice that told the user about them go.
 */
export function useDiscardUnreadableVotes() {
  const { useCases } = useAppServices();
  const refresh = useRefreshQueries();

  return useResultMutation<void, number, DiscardUnreadableVotesError>({
    execute: () => useCases.discardUnreadableVotes.execute(),
    onSuccess: async () => {
      await refresh.pendingVotes();
    },
  });
}
