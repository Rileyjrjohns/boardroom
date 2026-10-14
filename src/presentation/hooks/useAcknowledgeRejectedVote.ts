import type {
  AcknowledgeRejectedVoteError,
  AcknowledgeRejectedVoteInput,
} from '@application/use-cases/votes/AcknowledgeRejectedVote';

import { useResultMutation } from '../query/useResultMutation';
import { useAppServices } from '../services/AppServices';

import { useRefreshQueries } from './useRefreshQueries';

/**
 * Acknowledges a rejected vote: the use case deletes it from the outbox, and the outbox is asked
 * again, which lets the user vote again on the resolution when the rules still allow it.
 */
export function useAcknowledgeRejectedVote() {
  const { useCases } = useAppServices();
  const refresh = useRefreshQueries();

  return useResultMutation<AcknowledgeRejectedVoteInput, void, AcknowledgeRejectedVoteError>({
    execute: (input) => useCases.acknowledgeRejectedVote.execute(input),
    onSuccess: async () => {
      await refresh.pendingVotes();
    },
  });
}
