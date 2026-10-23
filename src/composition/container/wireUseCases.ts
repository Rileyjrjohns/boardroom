import { ObserveConnectivity } from '@core/application/use-cases/ObserveConnectivity';
import { AppLock } from '@features/auth/application/session/AppLock';
import { EvaluateAppLock } from '@features/auth/application/use-cases/EvaluateAppLock';
import { GetCurrentUser } from '@features/auth/application/use-cases/GetCurrentUser';
import { RestoreSession } from '@features/auth/application/use-cases/RestoreSession';
import { SignIn } from '@features/auth/application/use-cases/SignIn';
import { SignOut } from '@features/auth/application/use-cases/SignOut';
import { UnlockApp } from '@features/auth/application/use-cases/UnlockApp';
import { ScreenProtectionCoordinator } from '@features/documents/application/ScreenProtectionCoordinator';
import { CloseDocument } from '@features/documents/application/use-cases/CloseDocument';
import { ObserveScreenCapture } from '@features/documents/application/use-cases/ObserveScreenCapture';
import { OpenDocument } from '@features/documents/application/use-cases/OpenDocument';
import { GetMeeting } from '@features/meetings/application/use-cases/GetMeeting';
import { ListMeetings } from '@features/meetings/application/use-cases/ListMeetings';
import { AcknowledgeRejectedVote } from '@features/votes/application/use-cases/AcknowledgeRejectedVote';
import { CastVote } from '@features/votes/application/use-cases/CastVote';
import { DiscardUnreadableVotes } from '@features/votes/application/use-cases/DiscardUnreadableVotes';
import { ListPendingVotes } from '@features/votes/application/use-cases/ListPendingVotes';
import { SyncPendingVotes } from '@features/votes/application/use-cases/SyncPendingVotes';

import type { Ports, UseCaseSettings } from './Ports';

/** Every use case of the application, built once and shared. */
export interface UseCases {
  readonly signIn: SignIn;
  readonly signOut: SignOut;
  readonly restoreSession: RestoreSession;
  readonly getCurrentUser: GetCurrentUser;
  readonly evaluateAppLock: EvaluateAppLock;
  readonly unlockApp: UnlockApp;
  readonly listMeetings: ListMeetings;
  readonly getMeeting: GetMeeting;
  readonly openDocument: OpenDocument;
  readonly closeDocument: CloseDocument;
  readonly observeScreenCapture: ObserveScreenCapture;
  readonly observeConnectivity: ObserveConnectivity;
  readonly castVote: CastVote;
  readonly syncPendingVotes: SyncPendingVotes;
  readonly listPendingVotes: ListPendingVotes;
  readonly acknowledgeRejectedVote: AcknowledgeRejectedVote;
  readonly discardUnreadableVotes: DiscardUnreadableVotes;
}

/**
 * The wiring: manual constructor injection, typed end to end. Each use case is handed the ports
 * it names in its `deps`, plus the configuration values it takes. No container library, no lookup
 * by name, no module-level instance: a call builds a whole new set.
 *
 * Three objects hold something in memory, and must therefore exist once for the whole app:
 *
 * - `AppLock` says whether the app is locked. Every use case that reads, queues or sends something
 *   for the user asks it through the session guard, and `RestoreSession`, `EvaluateAppLock`,
 *   `UnlockApp`, `SignIn` and `SignOut` change it. Two instances would each be unlocked on their
 *   own, and the lock would guard nothing.
 * - `ScreenProtectionCoordinator` counts the views of the documents that are open and queues the
 *   calls to the platform. `OpenDocument` and `CloseDocument` share the one built here; two
 *   coordinators would each switch the protection off on their own say-so.
 * - `CastVote` refuses a second vote on a resolution being cast, and `SyncPendingVotes` refuses a
 *   second run while one is in progress. A second instance of either has no memory of the first.
 *
 * Every screen gets them from the returned object, which is built once by the root layout.
 */
export function wireUseCases(ports: Ports, settings: UseCaseSettings): UseCases {
  const {
    clock,
    monitoring,
    auth,
    biometricGate,
    connectivity,
    screenProtection,
    meetings,
    meetingCache,
    documents,
    documentCache,
    votes,
    outbox,
  } = ports;
  const { maxCacheAge, maxAttempts, gracePeriod, startsLocked } = settings;

  const appLock = new AppLock({ locked: startsLocked });
  const screenProtectionCoordinator = new ScreenProtectionCoordinator({ screenProtection });

  // What the session guard needs, which every use case that serves the user is given.
  const guard = { auth, clock, appLock, meetingCache, documentCache, monitoring };
  const cacheFallback = { ...guard, maxCacheAge };

  return {
    signIn: new SignIn({ auth, meetingCache, documentCache, monitoring, appLock }),
    signOut: new SignOut({ auth, meetingCache, documentCache, monitoring, appLock }),
    restoreSession: new RestoreSession({ ...guard }),
    getCurrentUser: new GetCurrentUser({ ...guard }),
    evaluateAppLock: new EvaluateAppLock({ auth, clock, gracePeriod, appLock }),
    unlockApp: new UnlockApp({ biometricGate, appLock }),
    listMeetings: new ListMeetings({ ...cacheFallback, meetings }),
    getMeeting: new GetMeeting({ ...cacheFallback, meetings }),
    openDocument: new OpenDocument({
      ...cacheFallback,
      documents,
      screenProtectionCoordinator,
    }),
    closeDocument: new CloseDocument({ screenProtectionCoordinator }),
    observeScreenCapture: new ObserveScreenCapture({ ...guard, screenProtection }),
    observeConnectivity: new ObserveConnectivity({ connectivity }),
    castVote: new CastVote({ ...cacheFallback, meetings, outbox, votes, biometricGate }),
    syncPendingVotes: new SyncPendingVotes({ ...guard, outbox, votes, maxAttempts }),
    listPendingVotes: new ListPendingVotes({ ...guard, outbox }),
    acknowledgeRejectedVote: new AcknowledgeRejectedVote({ ...guard, outbox }),
    discardUnreadableVotes: new DiscardUnreadableVotes({ ...guard, outbox }),
  };
}
