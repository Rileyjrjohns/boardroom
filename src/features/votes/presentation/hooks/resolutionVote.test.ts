import { voteUndeliverable } from '@features/votes/domain/errors/VoteDeliveryError';
import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { PARTICIPANT_ROLE } from '@features/meetings/domain/entities/Participant';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import {
  MILLIS_PER_HOUR,
  NOW,
  aMeeting,
  aParticipant,
  aPendingVote,
  aRejectedVote,
  aResolution,
  aResolutionId,
  aUserId,
  aVote,
  anAgendaItem,
  anAgendaItemId,
  at,
} from '@testing/domain/builders';

import { VOTE_VIEW, resolutionVoteView } from './resolutionVote';
import type { ResolutionVoteInput } from './resolutionVote';

// What the screen says about a vote is the eligibility rule of the domain, ordered by what the
// user most needs to know. The rule itself is tested with the domain; these tests check that it is
// the one that is asked, for every reason, and how the outbox changes what is said.

const RESOLUTION = aResolution();
const OPEN_MEETING = aMeeting({ agenda: [anAgendaItem({ resolution: RESOLUTION })] });
const EMPTY_OUTBOX = { pending: [], rejected: [] } as const;

function view(overrides: Partial<ResolutionVoteInput> = {}) {
  return resolutionVoteView({
    meeting: OPEN_MEETING,
    resolution: RESOLUTION,
    voterId: aUserId('user-1'),
    outbox: EMPTY_OUTBOX,
    now: NOW,
    ...overrides,
  });
}

function meetingWith(resolution: ReturnType<typeof aResolution>) {
  return aMeeting({ agenda: [anAgendaItem({ resolution })] });
}

describe('resolutionVoteView', () => {
  it('lets a voting member vote on an open resolution nobody voted on', () => {
    expect(view()).toEqual({ kind: VOTE_VIEW.Eligible });
  });

  it.each([
    ['a secretary', 'user-3', PARTICIPANT_ROLE.Secretary],
    ['a guest', 'user-4', PARTICIPANT_ROLE.Guest],
  ] as const)('says %s has no vote, with the role', (_who, userId, role) => {
    expect(view({ voterId: aUserId(userId) })).toEqual({
      kind: VOTE_VIEW.Ineligible,
      error: { code: VOTING_ERROR_CODE.NoVotingRights },
      role,
    });
  });

  it('says a user who is not in the meeting is not a participant', () => {
    expect(view({ voterId: aUserId('user-9') })).toEqual({
      kind: VOTE_VIEW.Ineligible,
      error: { code: VOTING_ERROR_CODE.NotAParticipant },
    });
  });

  it('says a closed resolution is closed', () => {
    const closed = aResolution({ status: RESOLUTION_STATUS.Closed });

    expect(view({ meeting: meetingWith(closed), resolution: closed })).toEqual({
      kind: VOTE_VIEW.Ineligible,
      error: { code: VOTING_ERROR_CODE.ResolutionClosed },
    });
  });

  it('says a voting window that is over is over, at the instant the meeting was loaded', () => {
    const lapsed = aResolution({ closesAt: at(MILLIS_PER_HOUR) });

    expect(
      view({ meeting: meetingWith(lapsed), resolution: lapsed, now: at(MILLIS_PER_HOUR) }),
    ).toEqual({ kind: VOTE_VIEW.Ineligible, error: { code: VOTING_ERROR_CODE.VotingWindowOver } });
    expect(
      view({ meeting: meetingWith(lapsed), resolution: lapsed, now: at(MILLIS_PER_HOUR - 1) }),
    ).toEqual({ kind: VOTE_VIEW.Eligible });
  });

  it('says a user who voted, as the server records it, has voted: a vote is final', () => {
    const voted = aResolution({ recordedVote: VOTE_CHOICE.Against });

    expect(view({ meeting: meetingWith(voted), resolution: voted })).toEqual({
      kind: VOTE_VIEW.Ineligible,
      error: { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
    });
  });

  it('says a vote waiting to be sent is waiting, with its choice, whatever the rule says now', () => {
    const waiting = aPendingVote(aVote({ choice: VOTE_CHOICE.Abstain }));
    const lapsed = aResolution({ closesAt: at(MILLIS_PER_HOUR) });

    expect(view({ outbox: { pending: [waiting], rejected: [] } })).toEqual({
      kind: VOTE_VIEW.Queued,
      choice: VOTE_CHOICE.Abstain,
    });
    expect(
      view({
        meeting: meetingWith(lapsed),
        resolution: lapsed,
        now: at(MILLIS_PER_HOUR),
        outbox: { pending: [waiting], rejected: [] },
      }),
    ).toEqual({ kind: VOTE_VIEW.Queued, choice: VOTE_CHOICE.Abstain });
  });

  it('says a rejected vote was rejected, with its reason, before anything else', () => {
    const rejected = aRejectedVote(aVote(), voteUndeliverable(5));
    const closed = aResolution({ status: RESOLUTION_STATUS.Closed });

    expect(view({ outbox: { pending: [], rejected: [rejected] } })).toEqual({
      kind: VOTE_VIEW.Rejected,
      reason: voteUndeliverable(5),
    });
    expect(
      view({
        meeting: meetingWith(closed),
        resolution: closed,
        outbox: { pending: [], rejected: [rejected] },
      }),
    ).toEqual({ kind: VOTE_VIEW.Rejected, reason: voteUndeliverable(5) });
  });

  it('ignores the votes of the outbox that belong to another resolution', () => {
    const other = aPendingVote(aVote({ resolutionId: aResolutionId('resolution-2') }));
    const otherRejected = aRejectedVote(aVote({ resolutionId: aResolutionId('resolution-3') }));

    expect(view({ outbox: { pending: [other], rejected: [otherRejected] } })).toEqual({
      kind: VOTE_VIEW.Eligible,
    });
  });

  it('judges the right resolution among several, wherever it sits in the agenda', () => {
    const second = aResolution({
      id: aResolutionId('resolution-2'),
      status: RESOLUTION_STATUS.Closed,
    });
    const meeting = aMeeting({
      agenda: [
        anAgendaItem({ resolution: RESOLUTION }),
        anAgendaItem({ resolution: second, position: 2, id: anAgendaItemId('agenda-2') }),
      ],
      participants: [aParticipant({ role: PARTICIPANT_ROLE.Member })],
    });

    expect(view({ meeting, resolution: RESOLUTION })).toEqual({ kind: VOTE_VIEW.Eligible });
    expect(view({ meeting, resolution: second })).toEqual({
      kind: VOTE_VIEW.Ineligible,
      error: { code: VOTING_ERROR_CODE.ResolutionClosed },
    });
  });
});
