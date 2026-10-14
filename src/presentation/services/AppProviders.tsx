import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { createQueryClient, discardSessionData } from '../query/createQueryClient';
import type { QueryClientOptions } from '../query/createQueryClient';
import { ACCESS, UiStoreProvider, createUiStore } from '../state/uiStore';
import type { Access, UiStore } from '../state/uiStore';

import { AppServicesProvider } from './AppServices';
import type { AppServices } from './AppServices';

/** The state of one app instance that lives outside the components. */
export interface AppState {
  readonly queryClient: QueryClient;
  readonly uiStore: UiStore;
}

export interface AppStateOptions extends Pick<QueryClientOptions, 'retryDelay'> {
  /** Where the user stands at the start. A test that renders a screen of the open app skips ahead. */
  readonly access?: Access;
  /** Whether the user is to be told that local data was reset. */
  readonly localDataReset?: boolean;
}

/**
 * The query client and the interface store of one app instance, wired to each other so that no
 * data of a session outlives it:
 *
 * - when a failure ends the session, the query client tells the store why (the user is sent to the
 *   sign-in or the lock screen) and empties its cache;
 * - whenever the user leaves the open app by any other way (they sign out, the lock is required on
 *   the way back from the background), the cache is emptied as well. It happens as the store
 *   changes, before the screens that show data are gone: they are removed by the navigator in the
 *   same update, and a query that is built again on the empty cache is answered with the lock or
 *   the missing session, which the store ignores since the user has already left.
 *
 * `AppProviders` calls this once per instance; a test calls it to hold on to the client, and may
 * give the delay of the retries and where the user stands.
 */
export function createAppState(options: AppStateOptions = {}): AppState {
  const { access, localDataReset, ...clientOptions } = options;
  const uiStore = createUiStore({
    ...(access === undefined ? {} : { access }),
    ...(localDataReset === undefined ? {} : { localDataReset }),
  });
  const queryClient = createQueryClient({
    ...clientOptions,
    onSessionEnded: (code) => {
      uiStore.getState().endSession(code);
    },
  });
  uiStore.subscribe((state, previous) => {
    if (previous.access === ACCESS.Unlocked && state.access !== ACCESS.Unlocked) {
      discardSessionData(queryClient);
    }
  });
  return { queryClient, uiStore };
}

interface AppProvidersProps {
  /** What the composition root built: the use cases and the settings. */
  readonly services: AppServices;
  /** The state to use instead of a new one: for a test that needs the client. */
  readonly state?: AppState;
  readonly children: ReactNode;
}

/**
 * Everything a screen needs above it, in one place: the use cases, the query client of this app
 * instance and the store of the interface state. The query client and the store are created here,
 * once, on the first render, so each instance of the app has its own. The root layout mounts this
 * and nothing else of the layer's state; what decides which screens the user can reach is the
 * navigator (`AppNavigator`) and the session controller (`SessionController`), inside it.
 */
export function AppProviders({ services, state, children }: AppProvidersProps) {
  const [{ queryClient, uiStore }] = useState(
    () => state ?? createAppState({ localDataReset: services.notices?.localDataReset ?? false }),
  );

  return (
    <AppServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <UiStoreProvider store={uiStore}>{children}</UiStoreProvider>
      </QueryClientProvider>
    </AppServicesProvider>
  );
}
