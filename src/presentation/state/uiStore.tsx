import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';

import type { MeetingsErrorCode } from '../i18n/translationKeys';

/**
 * The state of the interface, and nothing else. Server data is not here (it is in the query cache)
 * and neither is state that belongs to one component (it is in `useState`). Two things:
 *
 * - which period of the meetings list is selected. Today only the list reads it, so a `useState`
 *   would do (the list stays mounted below the detail, so nothing needs the store to survive
 *   opening a meeting). It is here because it is the first piece of interface state, and the store
 *   is the pattern the stack mandates for it;
 * - why the session ended, once it has. It is written by the query cache when a failure ends the
 *   session, outside of any component, and read by the root of the app: the cache has just been
 *   emptied, so it cannot remember it, and the component that would is the one being left.
 */
export interface UiState {
  readonly meetingsPeriod: MeetingPeriod;
  selectMeetingsPeriod(period: MeetingPeriod): void;
  /** The code of the failure that ended the session, or `undefined` while it goes on. */
  readonly sessionEndedBy: MeetingsErrorCode | undefined;
  endSession(code: MeetingsErrorCode): void;
}

export type UiStore = StoreApi<UiState>;

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createUiStore(): UiStore {
  return createStore<UiState>()((set) => ({
    meetingsPeriod: MEETING_PERIOD.Upcoming,
    selectMeetingsPeriod: (period) => {
      set({ meetingsPeriod: period });
    },
    sessionEndedBy: undefined,
    endSession: (code) => {
      set({ sessionEndedBy: code });
    },
  }));
}

const UiStoreContext = createContext<UiStore | undefined>(undefined);

interface UiStoreProviderProps {
  /** The store to provide. Without one, a new store is created on the first render. */
  readonly store?: UiStore;
  readonly children: ReactNode;
}

/** Provides the store to the tree below, creating it once, on the first render, when none is given. */
export function UiStoreProvider({ store: given, children }: UiStoreProviderProps) {
  const [store] = useState(() => given ?? createUiStore());
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
