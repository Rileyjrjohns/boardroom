import { findResolution, createMeeting } from '@features/meetings/domain/entities/Meeting';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import {
  aMeeting,
  aMeetingId,
  aMeetingSummary,
  aMeetingWithAgenda,
  aResolution,
  aResolutionId,
  aVote,
  anAgendaItem,
  anAgendaItemId,
  unwrap,
} from '@testing/domain/builders';

import { withVoteRecorded } from './withVoteRecorded';

const BASE = {
  summary: aMeetingSummary(),
  agenda: [] as ReturnType<typeof anAgendaItem>[],
  documents: [] as never[],
  participants: [] as never[],
};

describe('withVoteRecorded', () => {
  const vote = aVote({ choice: VOTE_CHOICE.Against });

  it('returns a copy in which the resolution carries the choice of the vote', () => {
    const meeting = aMeeting();

    const updated = withVoteRecorded(meeting, vote);

    expect(findResolution(updated, aResolutionId())?.recordedVote).toBe(VOTE_CHOICE.Against);
    expect(updated).toEqual({
      ...meeting,
      agenda: [
        {
          ...meeting.agenda[0],
          resolution: { ...aResolution(), recordedVote: VOTE_CHOICE.Against },
        },
      ],
    });
  });

  it('leaves the original meeting untouched', () => {
    const meeting = aMeeting();

    withVoteRecorded(meeting, vote);

    expect(findResolution(meeting, aResolutionId())).not.toHaveProperty('recordedVote');
  });

  it('only changes the resolution of the vote', () => {
    const other = anAgendaItem({
      id: anAgendaItemId('agenda-2'),
      position: 2,
      resolution: aResolution({ id: aResolutionId('resolution-2') }),
    });
    const meeting = unwrap(createMeeting({ ...BASE, agenda: [anAgendaItem(), other] }));

    const updated = withVoteRecorded(meeting, vote);

    expect(findResolution(updated, aResolutionId('resolution-2'))).not.toHaveProperty(
      'recordedVote',
    );
    expect(updated.agenda[1]).toBe(meeting.agenda[1]);
  });

  it('records the vote on a resolution that is not in the first item of the agenda', () => {
    const meeting = aMeetingWithAgenda();

    const updated = withVoteRecorded(
      meeting,
      aVote({ resolutionId: aResolutionId('resolution-2'), choice: VOTE_CHOICE.Abstain }),
    );

    expect(findResolution(updated, aResolutionId('resolution-2'))?.recordedVote).toBe(
      VOTE_CHOICE.Abstain,
    );
    expect(findResolution(updated, aResolutionId())).not.toHaveProperty('recordedVote');
    expect(updated.agenda[0]).toBe(meeting.agenda[0]);
    expect(updated.agenda[1]).toBe(meeting.agenda[1]);
  });

  it('returns the meeting unchanged for a vote of another meeting', () => {
    const meeting = aMeeting();

    expect(withVoteRecorded(meeting, aVote({ meetingId: aMeetingId('other') }))).toBe(meeting);
  });

  it('returns an equal meeting for a resolution it does not have', () => {
    const meeting = aMeeting();

    expect(withVoteRecorded(meeting, aVote({ resolutionId: aResolutionId('missing') }))).toEqual(
      meeting,
    );
  });
});
