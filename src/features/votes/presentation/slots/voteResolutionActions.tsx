import { useMemo } from 'react';
import type { ReactNode } from 'react';

import type { Instant } from '@core/domain/value-objects/Instant';
import { InlineError } from '@core/presentation/components/InlineError';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import { ResolutionVoteLine } from '@features/meetings/presentation/components/ResolutionVoteLine';
import type {
  MeetingActions,
  ResolutionActionsSlot,
} from '@features/meetings/presentation/slots/resolutionActions';

import { ResolutionVoting } from '../components/ResolutionVoting';
import { VOTE_VIEW } from '../hooks/resolutionVote';
import type { ResolutionVoteView } from '../hooks/resolutionVote';
import { VOTES_STATUS, unknownVoteView, useResolutionVotes } from '../hooks/useResolutionVotes';
import { VOTES_TEST_IDS } from '../testIds';

/**
 * What the votes show under a resolution: the line about the vote of the user (the one the server
 * recorded, the one that waits to be sent, or none, and nothing while it is not known) and what the
 * user can do about it (see `ResolutionVoting`).
 */
function ResolutionVoteActions({
  meeting,
  resolution,
  view,
}: {
  readonly meeting: Meeting;
  readonly resolution: Resolution;
  readonly view: ResolutionVoteView;
}): ReactNode {
  return (
    <>
      <ResolutionVoteLine
        resolution={resolution}
        {...(view.kind === VOTE_VIEW.Queued ? { queuedChoice: view.choice } : {})}
        unknown={view.kind === VOTE_VIEW.Loading || view.kind === VOTE_VIEW.Unavailable}
      />
      <ResolutionVoting meetingId={meeting.id} resolution={resolution} view={view} />
    </>
  );
}

/**
 * The votes on the resolutions of one meeting, as the slot of the meetings takes them: the state of
 * the votes of the user is read once for the meeting (who they are, what waits in their outbox),
 * and each resolution gets its view of it. A failure to read it is told at the top of the meeting,
 * with a way to try again, and the resolutions say nothing of the vote meanwhile.
 */
function useVoteActions(meeting: Meeting, now: Instant): MeetingActions {
  const votes = useResolutionVotes(meeting, now);

  return useMemo<MeetingActions>(
    () => ({
      notice:
        votes.status === VOTES_STATUS.Unavailable ? (
          <InlineError
            code={votes.error}
            onRetry={votes.retry}
            testID={VOTES_TEST_IDS.votingError}
          />
        ) : null,
      renderResolutionActions: (resolution) => (
        <ResolutionVoteActions
          meeting={meeting}
          resolution={resolution}
          view={
            votes.status === VOTES_STATUS.Ready ? votes.viewOf(resolution) : unknownVoteView(votes)
          }
        />
      ),
    }),
    [votes, meeting],
  );
}

/** What the votes plug into the meetings (see `ResolutionActionsSlot`). */
export const VOTE_RESOLUTION_ACTIONS: ResolutionActionsSlot = {
  useMeetingActions: useVoteActions,
};
