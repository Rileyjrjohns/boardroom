import { ALREADY_VOTED_SOURCE, VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import type { VotingError } from '@features/votes/domain/errors/VotingError';
import { err, ok } from '@core/domain/shared/Result';
import { createMeeting } from '@features/meetings/domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import {
  NOW,
  aMeeting,
  aMeetingSummary,
  aMeetingWithAgenda,
  aPendingVote,
  aResolution,
  aResolutionId,
  aUserId,
  aVote,
  anAgendaItem,
  anAgendaItemId,
  at,
  unwrap,
} from '@testing/domain/builders';

import { checkVotingEligibility } from './votingEligibility';
import type { VotingEligibilityInput } from './votingEligibility';

/** A meeting whose only resolution is `resolution`. */
function meetingWith(resolution: ReturnType<typeof aResolution>) {
  return unwrap(
    createMeeting({
      ...aMeeting(),
      summary: aMeetingSummary(),
      agenda: [anAgendaItem({ resolution })],
    }),
  );
}

function input(overrides: Partial<VotingEligibilityInput> = {}): VotingEligibilityInput {
  return {
    meeting: aMeeting(),
    resolutionId: aResolutionId(),
    voterId: aUserId('user-1'),
    queuedVotes: [],
    now: NOW,
    ...overrides,
  };
}

describe('checkVotingEligibility', () => {
  it('accepts a member on an open resolution', () => {
    expect(checkVotingEligibility(input())).toEqual(ok(undefined));
  });

  it('accepts the chair', () => {
    expect(checkVotingEligibility(input({ voterId: aUserId('user-2') }))).toEqual(ok(undefined));
  });

  it('rejects a resolution the meeting does not have', () => {
    expect(checkVotingEligibility(input({ resolutionId: aResolutionId('missing') }))).toEqual(
      err({ code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('missing') }),
    );
  });

  it('rejects somebody who is not a participant', () => {
    expect(checkVotingEligibility(input({ voterId: aUserId('stranger') }))).toEqual(
      err({ code: VOTING_ERROR_CODE.NotAParticipant }),
    );
  });

  it.each(['user-3', 'user-4'])('rejects the participant %s, who has no voting rights', (id) => {
    expect(checkVotingEligibility(input({ voterId: aUserId(id) }))).toEqual(
      err({ code: VOTING_ERROR_CODE.NoVotingRights }),
    );
  });

  it('rejects a closed resolution', () => {
    const meeting = meetingWith(aResolution({ status: RESOLUTION_STATUS.Closed }));

    expect(checkVotingEligibility(input({ meeting }))).toEqual(
      err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
    );
  });

  it('accepts a vote until the voting window closes', () => {
    const meeting = meetingWith(aResolution({ closesAt: at(1) }));

    expect(checkVotingEligibility(input({ meeting }))).toEqual(ok(undefined));
  });

  it.each([0, -1, -3_600_000])(
    'rejects a vote when the window closed %p ms from now, the closing instant included',
    (offset) => {
      const meeting = meetingWith(aResolution({ closesAt: at(offset) }));

      expect(checkVotingEligibility(input({ meeting }))).toEqual(
        err({ code: VOTING_ERROR_CODE.VotingWindowOver }),
      );
    },
  );

  it('rejects a voter whose vote is already recorded', () => {
    const meeting = meetingWith(aResolution({ recordedVote: VOTE_CHOICE.Against }));

    expect(checkVotingEligibility(input({ meeting }))).toEqual(
      err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
    );
  });

  it('rejects a voter whose vote waits in the outbox', () => {
    const queuedVotes = [aPendingVote(aVote())];

    expect(checkVotingEligibility(input({ queuedVotes }))).toEqual(
      err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Queued }),
    );
  });

  it('ignores a queued vote of somebody else, and a queued vote on another resolution', () => {
    const queuedVotes = [
      aPendingVote(aVote({ voterId: aUserId('user-2') })),
      aPendingVote(aVote({ resolutionId: aResolutionId('other') })),
    ];

    expect(checkVotingEligibility(input({ queuedVotes }))).toEqual(ok(undefined));
  });

  describe('a resolution that sits in a later item of the agenda', () => {
    const resolution2 = aResolutionId('resolution-2');
    const withAgenda = (
      first: ReturnType<typeof aResolution>,
      second: ReturnType<typeof aResolution>,
    ) =>
      unwrap(
        createMeeting({
          ...aMeetingWithAgenda(),
          summary: aMeetingSummary(),
          agenda: [
            anAgendaItem({ id: anAgendaItemId('agenda-1'), position: 1, resolution: first }),
            anAgendaItem({ id: anAgendaItemId('agenda-2'), position: 2, resolution: second }),
          ],
        }),
      );

    it('is found and accepted, for a member of the board', () => {
      expect(
        checkVotingEligibility(input({ meeting: aMeetingWithAgenda(), resolutionId: resolution2 })),
      ).toEqual(ok(undefined));
    });

    it('is judged on its own state, not on the state of the first resolution', () => {
      const meeting = withAgenda(
        aResolution({ status: RESOLUTION_STATUS.Closed }),
        aResolution({ id: resolution2 }),
      );

      expect(checkVotingEligibility(input({ meeting, resolutionId: resolution2 }))).toEqual(
        ok(undefined),
      );
      expect(checkVotingEligibility(input({ meeting }))).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
      );
    });

    it('is refused when it is the one that is closed, and the first one is open', () => {
      const meeting = withAgenda(
        aResolution(),
        aResolution({ id: resolution2, status: RESOLUTION_STATUS.Closed }),
      );

      expect(checkVotingEligibility(input({ meeting, resolutionId: resolution2 }))).toEqual(
        err({ code: VOTING_ERROR_CODE.ResolutionClosed }),
      );
      expect(checkVotingEligibility(input({ meeting }))).toEqual(ok(undefined));
    });

    it('is refused when the vote recorded is the one of that resolution, not of the first', () => {
      const meeting = withAgenda(
        aResolution({ recordedVote: VOTE_CHOICE.For }),
        aResolution({ id: resolution2 }),
      );

      expect(checkVotingEligibility(input({ meeting, resolutionId: resolution2 }))).toEqual(
        ok(undefined),
      );
      expect(checkVotingEligibility(input({ meeting }))).toEqual(
        err({ code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded }),
      );
    });

    it('is refused as not found when the id matches no resolution of any item', () => {
      expect(
        checkVotingEligibility(
          input({ meeting: aMeetingWithAgenda(), resolutionId: aResolutionId('resolution-3') }),
        ),
      ).toEqual(
        err({
          code: VOTING_ERROR_CODE.ResolutionNotFound,
          resolutionId: aResolutionId('resolution-3'),
        }),
      );
    });
  });

  describe('when several reasons apply at once, the earliest of the list wins', () => {
    const closed = meetingWith(aResolution({ status: RESOLUTION_STATUS.Closed }));
    const windowOver = meetingWith(aResolution({ closesAt: at(-1) }));
    const everything = meetingWith(
      aResolution({
        status: RESOLUTION_STATUS.Closed,
        closesAt: at(-1),
        recordedVote: VOTE_CHOICE.For,
      }),
    );
    const recorded = meetingWith(aResolution({ closesAt: at(-1), recordedVote: VOTE_CHOICE.For }));
    const queuedVotes = [aPendingVote(aVote())];

    it.each<[string, Partial<VotingEligibilityInput>, VotingError]>([
      [
        '1 over 2: an unknown resolution and a stranger',
        { resolutionId: aResolutionId('missing'), voterId: aUserId('stranger') },
        { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('missing') },
      ],
      [
        '1 over 3: an unknown resolution and a guest',
        { resolutionId: aResolutionId('missing'), voterId: aUserId('user-4') },
        { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('missing') },
      ],
      [
        '1 over the rest: an unknown resolution, in a meeting where everything else is wrong too',
        {
          meeting: everything,
          resolutionId: aResolutionId('missing'),
          voterId: aUserId('user-4'),
          queuedVotes,
        },
        { code: VOTING_ERROR_CODE.ResolutionNotFound, resolutionId: aResolutionId('missing') },
      ],
      [
        '2 over 4: a stranger and a closed resolution',
        { meeting: closed, voterId: aUserId('stranger') },
        { code: VOTING_ERROR_CODE.NotAParticipant },
      ],
      [
        '3 over 4: a guest and a closed resolution',
        { meeting: closed, voterId: aUserId('user-4') },
        { code: VOTING_ERROR_CODE.NoVotingRights },
      ],
      [
        '4 over 5: a closed resolution whose window is over',
        { meeting: everything },
        { code: VOTING_ERROR_CODE.ResolutionClosed },
      ],
      [
        '5 over 6: a window that is over, and a recorded vote',
        { meeting: recorded },
        { code: VOTING_ERROR_CODE.VotingWindowOver },
      ],
      [
        '5 over 6: a window that is over, and a queued vote',
        { meeting: windowOver, queuedVotes },
        { code: VOTING_ERROR_CODE.VotingWindowOver },
      ],
      [
        '6 recorded over 6 queued: a vote both recorded and queued',
        {
          meeting: meetingWith(aResolution({ recordedVote: VOTE_CHOICE.Against })),
          queuedVotes,
        },
        { code: VOTING_ERROR_CODE.AlreadyVoted, source: ALREADY_VOTED_SOURCE.Recorded },
      ],
    ])('%s', (_name, overrides, expected) => {
      expect(checkVotingEligibility(input(overrides))).toEqual(err(expected));
    });

    // A voter who is not in the meeting has no role, so 2 (not a participant) and 3 (no voting
    // rights) cannot apply together: there is no pair to order.
  });
});
