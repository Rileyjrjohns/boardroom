import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';

/**
 * The state of the interface that has to survive navigation, and nothing else. Server data is not
 * here (it is in the query cache) and neither is state that belongs to one component (it is in
 * `useState`). Today that is one thing: which period of the meetings list is selected, so that
 * coming back from a meeting shows the list the user left.
 */
export interface UiState {
  readonly meetingsPeriod: MeetingPeriod;
  selectMeetingsPeriod(period: MeetingPeriod): void;
}

export type UiStore = StoreApi<UiState>;

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createUiStore(): UiStore {
  return createStore<UiState>()((set) => ({
    meetingsPeriod: MEETING_PERIOD.Upcoming,
    selectMeetingsPeriod: (period) => {
      set({ meetingsPeriod: period });
    },
  }));
}

const UiStoreContext = createContext<UiStore | undefined>(undefined);

/** Creates the store once, on the first render, and provides it to the tree below. */
export function UiStoreProvider({ children }: { readonly children: ReactNode }) {
  const [store] = useState(createUiStore);
  return <UiStoreContext.Provider value={store}>{children}</UiStoreContext.Provider>;
}

/** Reads a part of the state, and re-renders only when that part changes. */
export function useUiStore<Selected>(selector: (state: UiState) => Selected): Selected {
  const store = useContext(UiStoreContext);
  if (store === undefined) {
    throw new Error('useUiStore must be used inside a UiStoreProvider.');
  }
  return useStore(store, selector);
}
