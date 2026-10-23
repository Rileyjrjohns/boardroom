import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Clock } from '@core/application/ports/Clock';
import type { ObserveConnectivity } from '@core/application/use-cases/ObserveConnectivity';
import type { EvaluateAppLock } from '@features/auth/application/use-cases/EvaluateAppLock';
import type { GetCurrentUser } from '@features/auth/application/use-cases/GetCurrentUser';
import type { RestoreSession } from '@features/auth/application/use-cases/RestoreSession';
import type { SignIn } from '@features/auth/application/use-cases/SignIn';
import type { SignOut } from '@features/auth/application/use-cases/SignOut';
import type { UnlockApp } from '@features/auth/application/use-cases/UnlockApp';
import type { CloseDocument } from '@features/documents/application/use-cases/CloseDocument';
import type { ObserveScreenCapture } from '@features/documents/application/use-cases/ObserveScreenCapture';
import type { OpenDocument } from '@features/documents/application/use-cases/OpenDocument';
import type { GetMeeting } from '@features/meetings/application/use-cases/GetMeeting';
import type { ListMeetings } from '@features/meetings/application/use-cases/ListMeetings';
import type { AcknowledgeRejectedVote } from '@features/votes/application/use-cases/AcknowledgeRejectedVote';
import type { CastVote } from '@features/votes/application/use-cases/CastVote';
import type { DiscardUnreadableVotes } from '@features/votes/application/use-cases/DiscardUnreadableVotes';
import type { ListPendingVotes } from '@features/votes/application/use-cases/ListPendingVotes';
import type { SyncPendingVotes } from '@features/votes/application/use-cases/SyncPendingVotes';

/**
 * The use cases the screens need. Presentation declares the shape it depends on, and whatever
 * builds the use cases (the composition root, a test) provides it: this layer never imports the
 * composition root. Only the `execute` of a use case is part of the shape, so a stand-in needs no
 * more than that. The composition root hands over every use case of the application and this
 * interface lists the ones used so far; a screen that needs another one adds it here.
 */
export interface UseCases {
  readonly restoreSession: Pick<RestoreSession, 'execute'>;
  readonly signIn: Pick<SignIn, 'execute'>;
  readonly signOut: Pick<SignOut, 'execute'>;
  readonly evaluateAppLock: Pick<EvaluateAppLock, 'execute'>;
  readonly unlockApp: Pick<UnlockApp, 'execute'>;
  readonly getCurrentUser: Pick<GetCurrentUser, 'execute'>;
  readonly listMeetings: Pick<ListMeetings, 'execute'>;
  readonly getMeeting: Pick<GetMeeting, 'execute'>;
  readonly openDocument: Pick<OpenDocument, 'execute'>;
  readonly closeDocument: Pick<CloseDocument, 'execute'>;
  readonly observeScreenCapture: Pick<ObserveScreenCapture, 'execute'>;
  readonly observeConnectivity: Pick<ObserveConnectivity, 'execute'>;
  readonly castVote: Pick<CastVote, 'execute'>;
  readonly syncPendingVotes: Pick<SyncPendingVotes, 'execute'>;
  readonly listPendingVotes: Pick<ListPendingVotes, 'execute'>;
  readonly acknowledgeRejectedVote: Pick<AcknowledgeRejectedVote, 'execute'>;
  readonly discardUnreadableVotes: Pick<DiscardUnreadableVotes, 'execute'>;
}

/** An account of the simulated server, as the sign-in screen of the demo offers it. */
export interface DemoAccount {
  readonly fullName: string;
  readonly email: string;
  /** The password of a simulated account protects nothing: it is shown to whoever runs the demo. */
  readonly password: string;
}

/** The connection of the simulated server, which the demo switches off and on. */
export interface DemoNetwork {
  readonly online: boolean;
  setOnline(online: boolean): void;
  /** Calls the listener each time the connection goes off or comes back. Returns what stops it. */
  subscribe(listener: (online: boolean) => void): () => void;
}

/**
 * What the demo drives: the connection of the simulated server, off and on, and the accounts of
 * the simulation. A real device has no switch to cut its own network and no account to hand out,
 * so these exist in the mock configuration only.
 */
export interface DemoControls {
  readonly network: DemoNetwork;
  readonly accounts: readonly DemoAccount[];
}

/**
 * What happened to the data of the device while the app was not running, that the user is owed an
 * explanation of. The composition root reads it while it starts.
 */
export interface AppNotices {
  /**
   * Local data was reset: it could not be read, and the app started on an empty one. Votes that
   * were waiting to be sent from this device may have been lost. Told once the app is open.
   */
  readonly localDataReset: boolean;
  /** The user has been told: it is forgotten, and they will not be told again. Never rejects. */
  acknowledgeLocalDataReset(): Promise<void>;
}

/** Values of the configuration that the screens depend on. */
export interface AppSettings {
  /** How many meetings a page of the list holds. */
  readonly meetingsPageSize: number;
}

/** Everything the presentation layer takes from the outside. */
export interface AppServices {
  readonly useCases: UseCases;
  readonly settings: AppSettings;
  /**
   * The clock of the use cases. This layer reads no other: the one instant it records itself, the
   * moment the app goes to the background, is read here so that `EvaluateAppLock` compares two
   * instants of the same clock.
   */
  readonly clock: Pick<Clock, 'now'>;
  /** Only the mock configuration has demo controls. */
  readonly demoControls?: DemoControls;
  /** What the user is owed an explanation of. Without it, nothing is. */
  readonly notices?: AppNotices;
}

const AppServicesContext = createContext<AppServices | undefined>(undefined);

interface AppServicesProviderProps {
  readonly services: AppServices;
  readonly children: ReactNode;
}

/** Exposes the use cases to the hooks of the layer, through React context. */
export function AppServicesProvider({ services, children }: AppServicesProviderProps) {
  return <AppServicesContext.Provider value={services}>{children}</AppServicesContext.Provider>;
}

/**
 * The use cases and settings of the app. A component outside the provider is a programming error,
 * hence the throw: there is nothing sensible to render without them.
 */
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === undefined) {
    throw new Error('useAppServices must be used inside an AppServicesProvider.');
  }
  return services;
}
