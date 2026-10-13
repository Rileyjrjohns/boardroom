import { AcknowledgeRejectedVote } from '@application/use-cases/votes/AcknowledgeRejectedVote';
import { CastVote } from '@application/use-cases/votes/CastVote';
import { CloseDocument } from '@application/use-cases/documents/CloseDocument';
import { EvaluateAppLock } from '@application/use-cases/auth/EvaluateAppLock';
import { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import { ListMeetings } from '@application/use-cases/meetings/ListMeetings';
import { ListPendingVotes } from '@application/use-cases/votes/ListPendingVotes';
import { ObserveScreenCapture } from '@application/use-cases/documents/ObserveScreenCapture';
import { OpenDocument } from '@application/use-cases/documents/OpenDocument';
import { RestoreSession } from '@application/use-cases/auth/RestoreSession';
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
  readonly evaluateAppLock: EvaluateAppLock;
  readonly unlockApp: UnlockApp;
  readonly listMeetings: ListMeetings;
  readonly getMeeting: GetMeeting;
  readonly openDocument: OpenDocument;
  readonly closeDocument: CloseDocument;
  readonly observeScreenCapture: ObserveScreenCapture;
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
 * Three objects guard something in memory, and must therefore exist once for the whole app:
 *
 * - `ScreenProtectionCoordinator` remembers which confidential documents are open. `OpenDocument`
 *   and `CloseDocument` share the one built here; two coordinators would each switch the
 *   protection off on their own say-so.
 * - `CastVote` refuses a second vote on a resolution being cast. A second instance has no memory
 *   of the first one's votes in flight.
 * - `SyncPendingVotes` refuses a second run while one is in progress. A second instance would send
 *   the same votes at the same time.
 *
 * Every screen gets them from the returned object, which is built once by the root layout.
 */
export function wireUseCases(ports: Ports, settings: UseCaseSettings): UseCases {
  const {
    clock,
    monitoring,
    auth,
    biometricGate,
    screenProtection,
    meetings,
    meetingCache,
    documents,
    documentCache,
    votes,
    outbox,
  } = ports;
  const { maxCacheAge, maxAttempts, gracePeriod } = settings;

  const screenProtectionCoordinator = new ScreenProtectionCoordinator({ screenProtection });

  return {
    signIn: new SignIn({ auth }),
    signOut: new SignOut({ auth, meetingCache, documentCache, monitoring }),
    restoreSession: new RestoreSession({ auth, clock, meetingCache, documentCache, monitoring }),
    evaluateAppLock: new EvaluateAppLock({ auth, clock, gracePeriod }),
    unlockApp: new UnlockApp({ biometricGate }),
    listMeetings: new ListMeetings({
      auth,
      clock,
      monitoring,
      maxCacheAge,
      meetings,
      meetingCache,
    }),
    getMeeting: new GetMeeting({ auth, clock, monitoring, maxCacheAge, meetings, meetingCache }),
    openDocument: new OpenDocument({
      auth,
      clock,
      monitoring,
      maxCacheAge,
      documents,
      documentCache,
      screenProtectionCoordinator,
    }),
    closeDocument: new CloseDocument({ screenProtectionCoordinator }),
    observeScreenCapture: new ObserveScreenCapture({ auth, clock, screenProtection, monitoring }),
    castVote: new CastVote({
      auth,
      clock,
      monitoring,
      maxCacheAge,
      meetings,
      meetingCache,
      outbox,
      votes,
      biometricGate,
    }),
    syncPendingVotes: new SyncPendingVotes({
      auth,
      clock,
      outbox,
      votes,
      meetingCache,
      monitoring,
      maxAttempts,
    }),
    listPendingVotes: new ListPendingVotes({ auth, clock, outbox }),
    acknowledgeRejectedVote: new AcknowledgeRejectedVote({ auth, clock, outbox }),
  };
}
