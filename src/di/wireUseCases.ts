import { AcknowledgeRejectedVote } from '@application/use-cases/votes/AcknowledgeRejectedVote';
import { CastVote } from '@application/use-cases/votes/CastVote';
import { CloseDocument } from '@application/use-cases/documents/CloseDocument';
import { ObserveConnectivity } from '@application/use-cases/connectivity/ObserveConnectivity';
import { EvaluateAppLock } from '@application/use-cases/auth/EvaluateAppLock';
import { GetCurrentUser } from '@application/use-cases/auth/GetCurrentUser';
import { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import { ListMeetings } from '@application/use-cases/meetings/ListMeetings';
import { ListPendingVotes } from '@application/use-cases/votes/ListPendingVotes';
import { ObserveScreenCapture } from '@application/use-cases/documents/ObserveScreenCapture';
import { OpenDocument } from '@application/use-cases/documents/OpenDocument';
import { RestoreSession } from '@application/use-cases/auth/RestoreSession';
import { AppLock } from '@application/shared/AppLock';
import { ScreenProtectionCoordinator } from '@application/shared/ScreenProtectionCoordinator';
import { SignIn } from '@application/use-cases/auth/SignIn';
import { SignOut } from '@application/use-cases/auth/SignOut';
import { SyncPendingVotes } from '@application/use-cases/votes/SyncPendingVotes';
import { UnlockApp } from '@application/use-cases/auth/UnlockApp';

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
  };
}
