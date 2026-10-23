import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';

import type { Clock } from '@core/application/ports/Clock';
import type { ObserveConnectivity } from '@core/application/use-cases/ObserveConnectivity';
import type { CoreServices } from '@core/presentation/services/CoreServices';
import type { AuthServices } from '@features/auth/presentation/services/AuthServices';
import type { DocumentsServices } from '@features/documents/presentation/services/DocumentsServices';
import type { MeetingsServices } from '@features/meetings/presentation/services/MeetingsServices';
import type { VotesServices } from '@features/votes/presentation/services/VotesServices';

export type {
  AppNotices,
  DemoAccount,
  DemoControls,
  DemoNetwork,
} from '@core/presentation/services/CoreServices';

/**
 * The use cases of the whole application, as the shell takes them: what each feature declares for
 * its own screens (`AuthServices`, `MeetingsServices`...), and the observation of the connection,
 * which is the shell's (`useConnectivityStatus`). The composition root hands over every use case of
 * the application and this interface lists the ones used so far; a screen that needs another one
 * adds it to the services of its feature. Only the `execute` of a use case is part of the shape, so
 * a stand-in needs no more than that.
 */
export interface UseCases
  extends
    AuthServices,
    Pick<MeetingsServices, 'listMeetings' | 'getMeeting'>,
    DocumentsServices,
    VotesServices {
  readonly observeConnectivity: Pick<ObserveConnectivity, 'execute'>;
}

/** Values of the configuration that the screens depend on. */
export interface AppSettings {
  /** How many meetings a page of the list holds. */
  readonly meetingsPageSize: number;
}

/**
 * Everything the presentation takes from the outside, as the composition root hands it over. The
 * shell puts it in the context of each feature (see `AppProviders`): a feature reads its own use
 * cases from its own context, and never imports this.
 */
export interface AppServices extends CoreServices {
  readonly useCases: UseCases;
  readonly settings: AppSettings;
  /**
   * The clock of the use cases. This layer reads no other: the one instant it records itself, the
   * moment the app goes to the background, is read here so that `EvaluateAppLock` compares two
   * instants of the same clock.
   */
  readonly clock: Pick<Clock, 'now'>;
}

const AppServicesContext = createContext<AppServices | undefined>(undefined);

interface AppServicesProviderProps {
  readonly services: AppServices;
  readonly children: ReactNode;
}

/** Exposes the services to the hooks of the shell, through React context. */
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
