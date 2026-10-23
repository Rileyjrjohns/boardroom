import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { ConnectivityStatus } from '@core/application/ports/Connectivity';

/**
 * The state of the interface that belongs to no feature, and nothing else. Server data is not here
 * (it is in the query cache) and neither is state that belongs to one component (it is in
 * `useState`) or to a feature (where the user stands is `auth`'s, which period of the meetings is
 * selected is the meetings', what the votes synchronisation did is the votes': each declares its
 * own store). Every field below is state that no query holds, that more than one place reads, and
 * that is written from outside any component (the system's events), which is what a store is for:
 *
 * - `connectivity`: what the device says about its connection. It is an event, not a request: the
 *   offline line of the banner (on the screens of the open app, and on the sign-in and lock
 *   screens) and the trigger of the synchronisation both follow it, and there is no query to
 *   cache it in;
 * - `privacyCover`: whether the content must be hidden, because the app is inactive or in the
 *   background (the app switcher takes its snapshot then), or because the lock has not yet been
 *   evaluated on the way back. Written by the events of the system, read by the root and by the
 *   dialogs, which are not inside the root's view;
 * - `localDataResetNotice`: whether the user is still to be told that local data was reset (votes
 *   waiting on this device may have been lost). It is known when the app starts, shown on the
 *   screens of the open app, so after the next sign-in or unlock, and it stays until the user has
 *   read it. It is not forgotten when they leave the open app: it is owed to them, not to a
 *   session.
 *
 * The interface store never holds a name, an email or a vote.
 */
export interface UiState {
  readonly connectivity: ConnectivityStatus;
  setConnectivity(status: ConnectivityStatus): void;

  readonly privacyCover: boolean;
  setPrivacyCover(covered: boolean): void;

  readonly localDataResetNotice: boolean;
  dismissLocalDataReset(): void;
}

export type UiStore = StoreApi<UiState>;

export interface UiStoreOptions {
  /** Whether the user is to be told that local data was reset. */
  readonly localDataReset?: boolean;
}

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createUiStore(options: UiStoreOptions = {}): UiStore {
  return createStore<UiState>()((set) => ({
    connectivity: CONNECTIVITY_STATUS.Online,
    setConnectivity: (status) => {
      set({ connectivity: status });
    },

    privacyCover: false,
    setPrivacyCover: (covered) => {
      set({ privacyCover: covered });
    },

    localDataResetNotice: options.localDataReset ?? false,
    dismissLocalDataReset: () => {
      set({ localDataResetNotice: false });
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

/**
 * The store itself, for code that reads the state at the moment an event fires instead of when it
 * renders (the system's events, a callback that outlives a render).
 */
export function useUiStoreApi(): UiStore {
  const store = useContext(UiStoreContext);
  if (store === undefined) {
    throw new Error('useUiStoreApi must be used inside a UiStoreProvider.');
  }
  return store;
}
