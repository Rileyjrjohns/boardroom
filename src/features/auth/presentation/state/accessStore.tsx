import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { createStore, useStore } from 'zustand';
import type { StoreApi } from 'zustand';

import type { ValueOf } from '@core/domain/shared/constants';
import type { SessionEndingCode } from '@features/auth/application/session/sessionPolicy';
import { SESSION_RESTORE } from '@features/auth/application/use-cases/RestoreSession';
import type { RestoredSession } from '@features/auth/application/use-cases/RestoreSession';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';

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

/**
 * The state of access of the interface, which is `auth`'s: the other features and the shared
 * components read it (the screens of the open app only run while it is `Unlocked`) and none writes
 * it but through the transitions below. Every field is state that no query holds, that more than
 * one place reads, and that is written from outside any component (the query cache, the system's
 * events), which is what a store is for:
 *
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
 *   showed it has just been left, so neither can remember it. It is forgotten when the user leaves
 *   the open app for another reason, or comes back.
 *
 * The store never holds a name, an email or a vote. What other features keep for the session (the
 * summary of a synchronisation, say) they forget themselves when the epoch moves.
 */
export interface AccessState {
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
}

export type AccessStore = StoreApi<AccessState>;

export interface AccessStoreOptions {
  /** Where the user stands at the start. `Starting` for the app; a screen under test may skip it. */
  readonly access?: Access;
}

/** A new store. Created per app instance and provided through context: no module-level store. */
export function createAccessStore(options: AccessStoreOptions = {}): AccessStore {
  return createStore<AccessState>()((set, get) => {
    /** Changes where the user stands: a new epoch, and what the session left to tell is forgotten. */
    const moveTo = (access: Access, extra: Partial<AccessState> = {}): void => {
      set({
        access,
        accessEpoch: get().accessEpoch + 1,
        sessionEndedBy: undefined,
        ...extra,
      });
    };
    /** Whether the app is open and the epoch is the one a result started under. */
    const isCurrentOpenApp = (epoch: number): boolean =>
      get().access === ACCESS.Unlocked && get().accessEpoch === epoch;

    return {
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
    };
  });
}

const AccessStoreContext = createContext<AccessStore | undefined>(undefined);

interface AccessStoreProviderProps {
  /** The store to provide. Without one, a new store is created on the first render. */
  readonly store?: AccessStore;
  readonly children: ReactNode;
}

/** Provides the store to the tree below, creating it once, on the first render, when none is given. */
export function AccessStoreProvider({ store: given, children }: AccessStoreProviderProps) {
  const [store] = useState(() => given ?? createAccessStore());
  return <AccessStoreContext.Provider value={store}>{children}</AccessStoreContext.Provider>;
}

/** Reads a part of the state, and re-renders only when that part changes. */
export function useAccessStore<Selected>(selector: (state: AccessState) => Selected): Selected {
  const store = useContext(AccessStoreContext);
  if (store === undefined) {
    throw new Error('useAccessStore must be used inside an AccessStoreProvider.');
  }
  return useStore(store, selector);
}

/**
 * The store itself, for code that reads the state at the moment an event fires instead of when it
 * renders (the system's events, a callback that outlives a render).
 */
export function useAccessStoreApi(): AccessStore {
  const store = useContext(AccessStoreContext);
  if (store === undefined) {
    throw new Error('useAccessStoreApi must be used inside an AccessStoreProvider.');
  }
  return store;
}
