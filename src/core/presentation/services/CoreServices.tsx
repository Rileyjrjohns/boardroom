import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

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

/**
 * What the shared components take from the outside, and no feature owns. The core declares the
 * shape it depends on and the composition provides it (the features have their own contexts, for
 * their use cases: see `MeetingsServices` and its relatives).
 */
export interface CoreServices {
  /** Only the mock configuration has demo controls. */
  readonly demoControls?: DemoControls;
  /** What the user is owed an explanation of. Without it, nothing is. */
  readonly notices?: AppNotices;
}

const CoreServicesContext = createContext<CoreServices | undefined>(undefined);

interface CoreServicesProviderProps {
  readonly services: CoreServices;
  readonly children: ReactNode;
}

export function CoreServicesProvider({ services, children }: CoreServicesProviderProps) {
  return <CoreServicesContext.Provider value={services}>{children}</CoreServicesContext.Provider>;
}

/**
 * The services of the shared components. A component outside the provider is a programming error,
 * hence the throw.
 */
export function useCoreServices(): CoreServices {
  const services = useContext(CoreServicesContext);
  if (services === undefined) {
    throw new Error('useCoreServices must be used inside a CoreServicesProvider.');
  }
  return services;
}
