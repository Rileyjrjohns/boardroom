import { useResultMutation } from '@core/presentation/query/useResultMutation';
import type { DiscardUnreadableVotesError } from '@features/votes/application/use-cases/DiscardUnreadableVotes';

import { useVotesServices } from '../services/VotesServices';

import { useRefreshQueries } from './useRefreshQueries';

/**
 * Discards the entries of the outbox that can no longer be read as a vote, on the user's request.
 * The outbox is asked again afterwards, which makes the notice that told the user about them go.
 */
export function useDiscardUnreadableVotes() {
  const { discardUnreadableVotes } = useVotesServices();
  const refresh = useRefreshQueries();

  return useResultMutation<void, number, DiscardUnreadableVotesError>({
    execute: () => discardUnreadableVotes.execute(),
    onSuccess: async () => {
      await refresh.pendingVotes();
    },
  });
}
