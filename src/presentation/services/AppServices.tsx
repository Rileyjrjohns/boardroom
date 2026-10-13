import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { ObserveConnectivity } from '@application/use-cases/connectivity/ObserveConnectivity';
import type { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import type { ListMeetings } from '@application/use-cases/meetings/ListMeetings';

/**
 * The use cases the screens need. Presentation declares the shape it depends on, and whatever
 * builds the use cases (the composition root, a test) provides it: this layer never imports the
 * composition root. Only the `execute` of a use case is part of the shape, so a stand-in needs no
 * more than that. The composition root hands over every use case of the application and this
 * interface lists the ones used so far; a screen that needs another one adds it here.
 */
export interface UseCases {
  readonly listMeetings: Pick<ListMeetings, 'execute'>;
  readonly getMeeting: Pick<GetMeeting, 'execute'>;
  readonly observeConnectivity: Pick<ObserveConnectivity, 'execute'>;
}

/**
 * The switch of the simulated server, for the demo: the connection of the mock configuration, off
 * and on. A real device has no such switch, so it is absent from every other configuration.
 */
export interface DemoControls {
  readonly online: boolean;
  setOnline(online: boolean): void;
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
