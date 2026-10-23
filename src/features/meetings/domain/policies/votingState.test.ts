import { NOW, aResolution, at } from '@testing/domain/builders';

import { RESOLUTION_STATUS } from '../entities/Resolution';

import { VOTING_STATE, getVotingState } from './votingState';

describe('getVotingState', () => {
  it('is open for an open resolution without a closing instant', () => {
    expect(getVotingState(aResolution(), NOW)).toBe(VOTING_STATE.Open);
  });

  it('is open until the closing instant, one millisecond before included', () => {
    expect(getVotingState(aResolution({ closesAt: at(1) }), NOW)).toBe(VOTING_STATE.Open);
  });

  it.each([0, -1, -3_600_000])(
    'is window over when the closing instant is %p ms from now, the instant itself included',
    (offset) => {
      expect(getVotingState(aResolution({ closesAt: at(offset) }), NOW)).toBe(
        VOTING_STATE.WindowOver,
      );
    },
  );

  it('is closed for a closed resolution, whatever the closing instant', () => {
    const closed = { status: RESOLUTION_STATUS.Closed } as const;
    expect(getVotingState(aResolution(closed), NOW)).toBe(VOTING_STATE.Closed);
    expect(getVotingState(aResolution({ ...closed, closesAt: at(1) }), NOW)).toBe(
      VOTING_STATE.Closed,
    );
    expect(getVotingState(aResolution({ ...closed, closesAt: at(-1) }), NOW)).toBe(
      VOTING_STATE.Closed,
    );
  });

  it('judges at the instant it is given, not at a clock of its own', () => {
    const resolution = aResolution({ closesAt: at(1000) });
    expect(getVotingState(resolution, at(999))).toBe(VOTING_STATE.Open);
    expect(getVotingState(resolution, at(1000))).toBe(VOTING_STATE.WindowOver);
  });
});
