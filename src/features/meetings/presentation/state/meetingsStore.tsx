import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

/**
 * The state of the interface that belongs to the meetings, and nothing else:
 *
 * - `meetingsPeriod`: which period of the meetings list is selected. Today only the list reads it,
 *   so a `useState` would do (the list stays mounted below the detail); it is here because it is
 *   the first piece of interface state, the store is the pattern the stack mandates for it, and it
 *   is kept when the user leaves the open app.
 */
export interface MeetingsState {
  readonly meetingsPeriod: MeetingPeriod;
  selectMeetingsPeriod(period: MeetingPeriod): void;
}

export type MeetingsStore = StoreApi<MeetingsState>;

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createMeetingsStore(): MeetingsStore {
  return createStore<MeetingsState>()((set) => ({
    meetingsPeriod: MEETING_PERIOD.Upcoming,
    selectMeetingsPeriod: (period) => {
      set({ meetingsPeriod: period });
    },
  }));
}

const MeetingsStoreContext = createContext<MeetingsStore | undefined>(undefined);

interface MeetingsStoreProviderProps {
  /** The store to provide. Without one, a new store is created on the first render. */
  readonly store?: MeetingsStore;
  readonly children: ReactNode;
}

/** Provides the store to the tree below, creating it once, on the first render, when none is given. */
export function MeetingsStoreProvider({ store: given, children }: MeetingsStoreProviderProps) {
  const [store] = useState(() => given ?? createMeetingsStore());
  return <MeetingsStoreContext.Provider value={store}>{children}</MeetingsStoreContext.Provider>;
}

/** Reads a part of the state, and re-renders only when that part changes. */
export function useMeetingsStore<Selected>(selector: (state: MeetingsState) => Selected): Selected {
  const store = useContext(MeetingsStoreContext);
  if (store === undefined) {
    throw new Error('useMeetingsStore must be used inside a MeetingsStoreProvider.');
  }
  return useStore(store, selector);
}
