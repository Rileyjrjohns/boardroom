import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import type { ValueOf } from '@domain/shared/constants';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import type { ConnectivityStatus } from '@application/ports/Connectivity';
import { SESSION_RESTORE } from '@application/use-cases/auth/RestoreSession';
import type { RestoredSession } from '@application/use-cases/auth/RestoreSession';

import type { SessionEndingCode } from '../query/createQueryClient';

/**
 * Where the user stands, which decides the screens they can reach (see `AppNavigator`). The
 * application layer holds the truth about the lock (`AppLock`) and the session, but no use case
 * reports it, and the stack has to know it to show the right screen: this is the presentation's
 * mirror of it, moved by the outcome of the use cases and by the failures that end a session.
 */
export const ACCESS = {
  /** `RestoreSession` has not answered yet: nothing is shown but the loading state. */
  Starting: 'starting',
  /** Nobody is signed in. The sign-in screen. */
  SignedOut: 'signedOut',
  /** Somebody is signed in and the app is locked. The lock screen. */
  Locked: 'locked',
  /** The app is open: the meetings, the votes. */
  Unlocked: 'unlocked',
} as const;

export type Access = ValueOf<typeof ACCESS>;

/** What a run of the synchronisation did that is worth telling the user. */
export interface SyncSummary {
  readonly synced: number;
  readonly rejected: number;
}

/**
 * The state of the interface, and nothing else. Server data is not here (it is in the query cache)
 * and neither is state that belongs to one component (it is in `useState`). Every field below is
 * state that no query holds, that more than one place reads, and that is written from outside any
 * component (the query cache, the system's events), which is what a store is for:
 *
 * - `meetingsPeriod`: which period of the meetings list is selected. Today only the list reads it,
 *   so a `useState` would do (the list stays mounted below the detail); it is here because it is
 *   the first piece of interface state, and the store is the pattern the stack mandates for it;
 * - `access`: where the user stands (see `ACCESS`). It is not derivable: no use case reports the
 *   lock, and the navigator, the lifecycle of the app and the failures that end a session all read
 *   or write it. A failure writes it from the query cache, outside any component. Its transitions
 *   are guarded: each one starts from the state it makes sense from (a lock from an open app, an
 *   unlock from a locked one, a sign-in from a signed-out one), and does nothing from any other;
 * - `accessEpoch`: a number that goes up every time `access` changes. Whatever starts under one
 *   access and answers later (a synchronisation, a check of the session, a request) reads the
 *   epoch when it starts and hands it back with its result, and the result is applied only if it is
 *   still the current one: the answer of a run for the user who left is not the business of the
 *   user who came after, and must neither be shown to them nor sign them out;
 * - `sessionEndedBy`: why the user was sent back to the sign-in or the lock screen, so that the
 *   screen can explain it. The cache that saw the failure has just been emptied and the screen that
 *   showed it has just been left, so neither can remember it;
 * - `connectivity`: what the device says about its connection. It is an event, not a request: the
 *   offline line of the banner (on the screens of the open app, and on the sign-in and lock
 *   screens) and the trigger of the synchronisation both follow it, and there is no query to
 *   cache it in;
 * - `privacyCover`: whether the content must be hidden, because the app is inactive or in the
 *   background (the app switcher takes its snapshot then), or because the lock has not yet been
 *   evaluated on the way back. Written by the events of the system, read by the root and by the
 *   dialogs, which are not inside the root's view;
 * - `syncSummary`: what the synchronisations sent or rejected, added up until the user dismisses
 *   it, so that a later run does not wipe what an earlier one told. A result that has to outlive
 *   the screen that happened to be showing when it came;
 * - `localDataResetNotice`: whether the user is still to be told that local data was reset (votes
 *   waiting on this device may have been lost). It is known when the app starts, shown on the
 *   screens of the open app, so after the next sign-in or unlock, and it stays until the user has
 *   read it. It is not forgotten when they leave the open app: it is owed to them, not to a
 *   session.
 *
 * Everything that belongs to a session (`syncSummary`, `sessionEndedBy`) is forgotten when the
 * user leaves `Unlocked`, and the interface store never holds a name, an email or a vote.
 */
export interface UiState {
  readonly meetingsPeriod: MeetingPeriod;
  selectMeetingsPeriod(period: MeetingPeriod): void;

  readonly access: Access;
  /** Goes up every time `access` changes: see above. */
  readonly accessEpoch: number;
  /** `RestoreSession` answered: somebody is signed in (locked), or nobody is. Only from `Starting`. */
  sessionRestored(status: RestoredSession['status']): void;
  /** A sign-in succeeded: the app is open (the credentials just typed prove presence). Only from `SignedOut`. */
  signedIn(): void;
  /** The biometric unlock succeeded. Only from `Locked`. */
  unlocked(): void;
  /**
   * The app has to be locked: the lock was evaluated on the way back and is required, or a sign-out
   * failed after the use case had locked the app. Only from `Unlocked`, and only for the epoch the
   * check started under: a late check never puts a lock screen back for a session that has ended.
   */
  locked(epoch: number): void;
  /** The user signed out, or chose to forget a session that could not be read. Not from `SignedOut`. */
  signedOut(): void;
  /**
   * A failure said the session is over (see `isSessionEndingCode`). `appLocked` sends the user to
   * the lock screen, every other code to the sign-in screen, with the reason. Only an open app has
   * a session to end, and only for the epoch the failing request started under: a failure that
   * arrives after the user left it (a request that was still on its way when they signed out), or
   * for a user who has been replaced since, is ignored.
   */
  endSession(code: SessionEndingCode, epoch: number): void;
  /** The code of the failure that sent the user to the sign-in or lock screen, if one did. */
  readonly sessionEndedBy: SessionEndingCode | undefined;

  readonly connectivity: ConnectivityStatus;
  setConnectivity(status: ConnectivityStatus): void;

  readonly privacyCover: boolean;
  setPrivacyCover(covered: boolean): void;

  readonly syncSummary: SyncSummary | undefined;
  /**
   * Adds what a run sent or rejected to the summary being shown, for the epoch the run started
   * under, while the app is open. A result for another epoch is dropped.
   */
  showSyncSummary(summary: SyncSummary, epoch: number): void;
  dismissSyncSummary(): void;

  readonly localDataResetNotice: boolean;
  dismissLocalDataReset(): void;
}

export type UiStore = StoreApi<UiState>;

export interface UiStoreOptions {
  /** Where the user stands at the start. `Starting` for the app; a screen under test may skip it. */
  readonly access?: Access;
  /** Whether the user is to be told that local data was reset. */
  readonly localDataReset?: boolean;
}

/** What leaving the open app forgets. */
const SESSION_FORGOTTEN = { syncSummary: undefined, sessionEndedBy: undefined } as const;

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createUiStore(options: UiStoreOptions = {}): UiStore {
  return createStore<UiState>()((set, get) => {
    /** Changes where the user stands: a new epoch, and what the session left to tell is forgotten. */
    const moveTo = (access: Access, extra: Partial<UiState> = {}): void => {
      set({
        access,
        accessEpoch: get().accessEpoch + 1,
        ...SESSION_FORGOTTEN,
        ...extra,
      });
    };
    /** Whether the app is open and the epoch is the one a result started under. */
    const isCurrentOpenApp = (epoch: number): boolean =>
      get().access === ACCESS.Unlocked && get().accessEpoch === epoch;

    return {
      meetingsPeriod: MEETING_PERIOD.Upcoming,
      selectMeetingsPeriod: (period) => {
        set({ meetingsPeriod: period });
      },

      access: options.access ?? ACCESS.Starting,
      accessEpoch: 0,
      sessionRestored: (status) => {
        if (get().access !== ACCESS.Starting) return;
        moveTo(status === SESSION_RESTORE.None ? ACCESS.SignedOut : ACCESS.Locked);
      },
      signedIn: () => {
        if (get().access !== ACCESS.SignedOut) return;
        moveTo(ACCESS.Unlocked);
      },
      unlocked: () => {
        if (get().access !== ACCESS.Locked) return;
        moveTo(ACCESS.Unlocked);
      },
      locked: (epoch) => {
        if (!isCurrentOpenApp(epoch)) return;
        moveTo(ACCESS.Locked);
      },
      signedOut: () => {
        if (get().access === ACCESS.SignedOut) return;
        moveTo(ACCESS.SignedOut);
      },
      endSession: (code, epoch) => {
        if (!isCurrentOpenApp(epoch)) return;
        moveTo(code === AUTHENTICATION_ERROR_CODE.AppLocked ? ACCESS.Locked : ACCESS.SignedOut, {
          sessionEndedBy: code,
        });
      },
      sessionEndedBy: undefined,

      connectivity: CONNECTIVITY_STATUS.Online,
      setConnectivity: (status) => {
        set({ connectivity: status });
      },

      privacyCover: false,
      setPrivacyCover: (covered) => {
        set({ privacyCover: covered });
      },

      syncSummary: undefined,
      showSyncSummary: (summary, epoch) => {
        // A result that comes after the user left the open app, or for the user before them, is not
        // theirs to read.
        if (!isCurrentOpenApp(epoch)) return;
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

      localDataResetNotice: options.localDataReset ?? false,
      dismissLocalDataReset: () => {
        set({ localDataResetNotice: false });
      },
    };
  });
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
