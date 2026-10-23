import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { isVotingError } from '@features/votes/domain/errors/VotingError';
import { useResultMutation } from '@core/presentation/query/useResultMutation';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import type {
  CastVoteError,
  CastVoteInput,
  CastVoteOutcome,
} from '@features/votes/application/use-cases/CastVote';

import { useVotesServices } from '../services/VotesServices';

import { useRefreshQueries } from './useRefreshQueries';

/**
 * Casts a vote: the `CastVote` use case, which asks for the biometric confirmation. Once it has
 * succeeded, the queries that show the vote are asked again, and `onCast` is called when they have
 * answered, so the screen that closes its confirmation at that moment shows the vote where it is:
 *
 * - submitted: the server recorded it, so the meeting is asked again (the resolution carries the
 *   vote) and so is the outbox (nothing changed there, but a rejected vote of an earlier attempt
 *   may have);
 * - queued: it waits in the outbox, and that is what changed.
 *
 * A vote the rules refuse tells the screen something new about the meeting (it closed, the user
 * voted elsewhere), so those refreshes happen for a refusal too. Nothing is shown before the use
 * cases have answered: there is no optimistic vote that the server could contradict.
 */
export function useCastVote(onCast: (outcome: CastVoteOutcome) => void) {
  const { castVote } = useVotesServices();
  const refresh = useRefreshQueries();

  return useResultMutation<CastVoteInput, CastVoteOutcome, CastVoteError>({
    execute: (input) => castVote.execute(input),
    onSuccess: async (outcome, input) => {
      await Promise.all(
        outcome.status === CAST_VOTE_STATUS.Submitted
          ? [refresh.meeting(input.meetingId), refresh.pendingVotes()]
          : [refresh.pendingVotes()],
      );
      onCast(outcome);
    },
    onFailure: async (failure, input) => {
      const learnedSomething =
        isVotingError(failure) || failure.code === VOTE_DELIVERY_ERROR_CODE.PreviouslyRejected;
      if (learnedSomething) {
        await Promise.all([refresh.meeting(input.meetingId), refresh.pendingVotes()]);
      }
    },
  });
}
