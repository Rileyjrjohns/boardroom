import { useCallback, useMemo } from 'react';

import type { Instant } from '@core/domain/value-objects/Instant';
import { useErrorCodeOf } from '@core/presentation/errors/ErrorCatalog';
import { useCurrentUser } from '@features/auth/presentation/hooks/useCurrentUser';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';

import { VOTE_VIEW, resolutionVoteView } from './resolutionVote';
import type { ResolutionVoteView } from './resolutionVote';
import { usePendingVotes } from './usePendingVotes';

export const VOTES_STATUS = {
  Loading: 'loading',
  Unavailable: 'unavailable',
  Ready: 'ready',
} as const;

/** What the votes of the user on the resolutions of one meeting need, and whether they are known. */
export type ResolutionVotes =
  | { readonly status: typeof VOTES_STATUS.Loading }
  | {
      readonly status: typeof VOTES_STATUS.Unavailable;
      /** Why: only a failure that asking again can fix gets this far (the others end the session). */
      readonly error: string;
      retry(): void;
    }
  | {
      readonly status: typeof VOTES_STATUS.Ready;
      viewOf(resolution: Resolution): ResolutionVoteView;
    };

/**
 * The state of the vote of the user on every resolution of a meeting: who they are and what waits
 * in their outbox (two queries, shared by every meeting and every resolution), applied to the
 * meeting with the eligibility rule of the domain (see `resolutionVoteView`). `now` is the instant
 * the meeting was loaded at.
 */
export function useResolutionVotes(meeting: Meeting, now: Instant): ResolutionVotes {
  const user = useCurrentUser();
  const errorCodeOf = useErrorCodeOf();
  const outbox = usePendingVotes();
  const { refetch: refetchUser } = user;
  const { refetch: refetchOutbox } = outbox;
  const voterId = user.data?.id;
  const content = outbox.data;

  const retry = useCallback(() => {
    if (user.data === undefined) void refetchUser();
    if (outbox.data === undefined) void refetchOutbox();
  }, [user.data, outbox.data, refetchUser, refetchOutbox]);

  return useMemo<ResolutionVotes>(() => {
    if (voterId !== undefined && content !== undefined) {
      return {
        status: VOTES_STATUS.Ready,
        viewOf: (resolution) =>
          resolutionVoteView({ meeting, resolution, voterId, outbox: content, now }),
      };
    }
    const failed = user.isError ? user.error : outbox.isError ? outbox.error : undefined;
    if (failed !== undefined) {
      return { status: VOTES_STATUS.Unavailable, error: errorCodeOf(failed), retry };
    }
    return { status: VOTES_STATUS.Loading };
  }, [
    meeting,
    now,
    voterId,
    content,
    user.isError,
    user.error,
    outbox.isError,
    outbox.error,
    retry,
    errorCodeOf,
  ]);
}

/** The view of a resolution while its votes are not known. */
export function unknownVoteView(
  votes: Exclude<ResolutionVotes, { readonly status: typeof VOTES_STATUS.Ready }>,
): ResolutionVoteView {
  return votes.status === VOTES_STATUS.Loading
    ? { kind: VOTE_VIEW.Loading }
    : { kind: VOTE_VIEW.Unavailable };
}
