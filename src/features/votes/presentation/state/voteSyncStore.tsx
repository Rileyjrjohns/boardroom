import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import type { AccessStore } from '@features/auth/presentation/state/accessStore';

/** What a run of the synchronisation did that is worth telling the user. */
export interface SyncSummary {
  readonly synced: number;
  readonly rejected: number;
}

/**
 * The state of the interface that belongs to the votes, and nothing else:
 *
 * - `syncSummary`: what the synchronisations sent or rejected, added up until the user dismisses
 *   it, so that a later run does not wipe what an earlier one told. A result that has to outlive
 *   the screen that happened to be showing when it came. It belongs to the session: it is forgotten
 *   when the user leaves the open app (the epoch of the access moves), and a result for another
 *   epoch is dropped.
 *
 * It never holds the choice of a vote: a report names resolutions and counts only.
 */
export interface VoteSyncState {
  readonly syncSummary: SyncSummary | undefined;
  /**
   * Adds what a run sent or rejected to the summary being shown, for the epoch the run started
   * under, while the app is open. A result for another epoch is dropped.
   */
  showSyncSummary(summary: SyncSummary, epoch: number): void;
  dismissSyncSummary(): void;
}

export type VoteSyncStore = StoreApi<VoteSyncState>;

/**
 * A new store. Created per app instance and provided through context: no module-level store. It
 * follows the access it is given (`auth`'s): whatever the session left to tell is forgotten as soon
 * as the user leaves the open app, the same moment their access changes.
 */
export function createVoteSyncStore(access: AccessStore): VoteSyncStore {
  const store = createStore<VoteSyncState>()((set, get) => ({
    syncSummary: undefined,
    showSyncSummary: (summary, epoch) => {
      // A result that comes after the user left the open app, or for the user before them, is not
      // theirs to read.
      const { access: where, accessEpoch } = access.getState();
      if (where !== ACCESS.Unlocked || accessEpoch !== epoch) return;
      const shown = get().syncSummary;
      set({
        syncSummary: {
          synced: (shown?.synced ?? 0) + summary.synced,
          rejected: (shown?.rejected ?? 0) + summary.rejected,
        },
      });
    },
    dismissSyncSummary: () => {
      set({ syncSummary: undefined });
    },
  }));
  access.subscribe((state, previous) => {
    if (state.accessEpoch !== previous.accessEpoch) store.setState({ syncSummary: undefined });
  });
  return store;
}

const VoteSyncStoreContext = createContext<VoteSyncStore | undefined>(undefined);

interface VoteSyncStoreProviderProps {
  readonly store: VoteSyncStore;
  readonly children: ReactNode;
}

/** Provides the store to the tree below. */
export function VoteSyncStoreProvider({ store: given, children }: VoteSyncStoreProviderProps) {
  const [store] = useState(() => given);
  return <VoteSyncStoreContext.Provider value={store}>{children}</VoteSyncStoreContext.Provider>;
}

/** Reads a part of the state, and re-renders only when that part changes. */
export function useVoteSyncStore<Selected>(selector: (state: VoteSyncState) => Selected): Selected {
  const store = useContext(VoteSyncStoreContext);
  if (store === undefined) {
    throw new Error('useVoteSyncStore must be used inside a VoteSyncStoreProvider.');
  }
  return useStore(store, selector);
}

/**
 * The store itself, for code that reads the state at the moment an event fires instead of when it
 * renders (the system's events, a callback that outlives a render).
 */
export function useVoteSyncStoreApi(): VoteSyncStore {
  const store = useContext(VoteSyncStoreContext);
  if (store === undefined) {
    throw new Error('useVoteSyncStoreApi must be used inside a VoteSyncStoreProvider.');
  }
  return store;
}
