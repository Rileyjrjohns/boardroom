import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Instant } from '@core/domain/value-objects/Instant';
import type { Meeting } from '@features/meetings/domain/entities/Meeting';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';

/**
 * What a feature adds to the resolutions of a meeting, once for the meeting and under each one.
 * Voting is the case: a resolution is the business of the meetings, what the user can do about it
 * (cast a vote, see it wait to be sent) is the business of the votes. The meetings declare this
 * slot, the votes implement it, and the composition plugs the one into the other
 * (`ResolutionActionsProvider`): the meetings never import the votes.
 */
export interface MeetingActions {
  /**
   * Shown with the notices at the top of the meeting: what concerns all its resolutions together
   * (the votes could not be read, with a way to try again). Nothing when there is nothing to say.
   */
  readonly notice: ReactNode;
  /**
   * Shown under a resolution of the meeting, from the line about the vote of the user down. When
   * the slot has none, the resolution tells the vote the server recorded and offers nothing to do.
   */
  renderResolutionActions(resolution: Resolution): ReactNode;
}

/** What implements the slot: a hook, called once for the meeting that is shown. */
export interface ResolutionActionsSlot {
  /**
   * Reads what the actions of the resolutions of `meeting` share, judged at `now` (the instant the
   * meeting was loaded at: the presentation reads no clock). It is a hook, so it follows the state
   * of the screen that calls it.
   */
  useMeetingActions(meeting: Meeting, now: Instant): MeetingActions;
}

/** The slot when nothing is plugged into it: the meeting is display only. */
const NO_RESOLUTION_ACTIONS: ResolutionActionsSlot = {
  useMeetingActions: () => ({ notice: null, renderResolutionActions: () => undefined }),
};

const ResolutionActionsContext = createContext<ResolutionActionsSlot>(NO_RESOLUTION_ACTIONS);

interface ResolutionActionsProviderProps {
  readonly slot: ResolutionActionsSlot;
  readonly children: ReactNode;
}

/** Plugs what a feature adds to the resolutions of the meetings. */
export function ResolutionActionsProvider({ slot, children }: ResolutionActionsProviderProps) {
  return (
    <ResolutionActionsContext.Provider value={slot}>{children}</ResolutionActionsContext.Provider>
  );
}

/** The slot of the resolution actions. */
export function useResolutionActionsSlot(): ResolutionActionsSlot {
  return useContext(ResolutionActionsContext);
}
