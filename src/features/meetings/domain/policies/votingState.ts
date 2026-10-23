import type { ValueOf } from '@core/domain/shared/constants';
import { isAtOrAfter } from '@core/domain/value-objects/Instant';
import type { Instant } from '@core/domain/value-objects/Instant';

import { RESOLUTION_STATUS } from '../entities/Resolution';
import type { Resolution } from '../entities/Resolution';

/**
 * Where a resolution stands for voting at a given instant. It is the one definition of "can still
 * be voted on": the eligibility policy and the screens both ask this function, so a resolution
 * cannot be open on a screen and closed for the rules.
 */
export const VOTING_STATE = {
  /** The status is open and the voting window, if there is one, is not over. */
  Open: 'open',
  /** The status says the resolution is closed. */
  Closed: 'closed',
  /** The status is still open, but the voting window is over (`closesAt` is reached). */
  WindowOver: 'windowOver',
} as const;

export type VotingState = ValueOf<typeof VOTING_STATE>;

/**
 * The state of voting on a resolution at `now`. A closed status wins over the window: a resolution
 * that was closed by hand stays `Closed` whatever `closesAt` says. The closing instant itself is
 * already too late, as for the eligibility to vote. A resolution without a `closesAt` stays open
 * until its status says otherwise.
 */
export function getVotingState(resolution: Resolution, now: Instant): VotingState {
  if (resolution.status === RESOLUTION_STATUS.Closed) return VOTING_STATE.Closed;
  if (resolution.closesAt !== undefined && isAtOrAfter(now, resolution.closesAt)) {
    return VOTING_STATE.WindowOver;
  }
  return VOTING_STATE.Open;
}
