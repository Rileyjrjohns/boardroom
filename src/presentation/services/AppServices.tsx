import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Clock } from '@application/ports/Clock';
import type { EvaluateAppLock } from '@application/use-cases/auth/EvaluateAppLock';
import type { GetCurrentUser } from '@application/use-cases/auth/GetCurrentUser';
import type { RestoreSession } from '@application/use-cases/auth/RestoreSession';
import type { SignIn } from '@application/use-cases/auth/SignIn';
import type { SignOut } from '@application/use-cases/auth/SignOut';
import type { UnlockApp } from '@application/use-cases/auth/UnlockApp';
import type { ObserveConnectivity } from '@application/use-cases/connectivity/ObserveConnectivity';
import type { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import type { ListMeetings } from '@application/use-cases/meetings/ListMeetings';
import type { AcknowledgeRejectedVote } from '@application/use-cases/votes/AcknowledgeRejectedVote';
import type { CastVote } from '@application/use-cases/votes/CastVote';
import type { ListPendingVotes } from '@application/use-cases/votes/ListPendingVotes';
import type { SyncPendingVotes } from '@application/use-cases/votes/SyncPendingVotes';

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
  readonly observeConnectivity: Pick<ObserveConnectivity, 'execute'>;
  readonly castVote: Pick<CastVote, 'execute'>;
  readonly syncPendingVotes: Pick<SyncPendingVotes, 'execute'>;
  readonly listPendingVotes: Pick<ListPendingVotes, 'execute'>;
  readonly acknowledgeRejectedVote: Pick<AcknowledgeRejectedVote, 'execute'>;
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
