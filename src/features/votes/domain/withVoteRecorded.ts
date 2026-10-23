import type { Meeting } from '@features/meetings/domain/entities/Meeting';

import type { Vote } from './entities/Vote';

/**
 * A copy of the meeting in which the vote is recorded on its resolution, as the server records it
 * once the vote is accepted. Used to keep a cached copy truthful, so that the voter cannot vote
 * again from it. The meeting is returned unchanged when the vote belongs to another meeting or to a
 * resolution it does not have.
 *
 * The meeting is the business of `meetings`; that a vote shows on it is a rule of `votes`, which is
 * why this is here and not in the entity.
 */
export function withVoteRecorded(meeting: Meeting, vote: Vote): Meeting {
  if (vote.meetingId !== meeting.id) return meeting;
  return {
    ...meeting,
    agenda: meeting.agenda.map((item) =>
      item.resolution?.id === vote.resolutionId
        ? { ...item, resolution: { ...item.resolution, recordedVote: vote.choice } }
        : item,
    ),
  };
}
