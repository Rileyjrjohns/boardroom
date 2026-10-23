import { useResultMutation } from '@core/presentation/query/useResultMutation';
import type {
  AcknowledgeRejectedVoteError,
  AcknowledgeRejectedVoteInput,
} from '@features/votes/application/use-cases/AcknowledgeRejectedVote';

import { useVotesServices } from '../services/VotesServices';

import { useRefreshQueries } from './useRefreshQueries';

/**
 * Acknowledges a rejected vote: the use case deletes it from the outbox, and the outbox is asked
 * again, which lets the user vote again on the resolution when the rules still allow it.
 */
export function useAcknowledgeRejectedVote() {
  const { acknowledgeRejectedVote } = useVotesServices();
  const refresh = useRefreshQueries();

  return useResultMutation<AcknowledgeRejectedVoteInput, void, AcknowledgeRejectedVoteError>({
    execute: (input) => acknowledgeRejectedVote.execute(input),
    onSuccess: async () => {
      await refresh.pendingVotes();
    },
  });
}
