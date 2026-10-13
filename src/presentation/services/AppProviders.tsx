import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { createQueryClient } from '../query/createQueryClient';
import type { QueryClientOptions } from '../query/createQueryClient';
import { SessionEndedScreen } from '../screens/SessionEndedScreen';
import { UiStoreProvider, createUiStore, useUiStore } from '../state/uiStore';
import type { UiStore } from '../state/uiStore';

import { AppServicesProvider } from './AppServices';
import type { AppServices } from './AppServices';

/** The state of one app instance that lives outside the components. */
export interface AppState {
  readonly queryClient: QueryClient;
  readonly uiStore: UiStore;
}

/**
 * The query client and the interface store of one app instance, wired to each other: when a
 * failure ends the session, the query client empties its cache and tells the store why, and the
 * root of the app shows it (see `SessionEnded`). `AppProviders` calls this once per instance; a
 * test calls it to hold on to the client, and may give the delay of the retries, which is the
 * only thing it changes.
 */
export function createAppState(options: Pick<QueryClientOptions, 'retryDelay'> = {}): AppState {
  const uiStore = createUiStore();
  const queryClient = createQueryClient({
    ...options,
    onSessionEnded: (code) => {
      uiStore.getState().endSession(code);
    },
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
 * and nothing else of the layer's state.
 */
export function AppProviders({ services, state, children }: AppProvidersProps) {
  const [{ queryClient, uiStore }] = useState(() => state ?? createAppState());

  return (
    <AppServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <UiStoreProvider store={uiStore}>
          <SessionEnded>{children}</SessionEnded>
        </UiStoreProvider>
      </QueryClientProvider>
    </AppServicesProvider>
  );
}

/**
 * Shows the screens while the session goes on and `SessionEndedScreen` once it is over. A failure
 * that ends the session empties the cache; screens that stayed would ask again and be refused
 * again, so they are replaced instead, which also leaves no query running.
 */
function SessionEnded({ children }: { readonly children: ReactNode }) {
  const endedBy = useUiStore((state) => state.sessionEndedBy);

  return endedBy === undefined ? children : <SessionEndedScreen code={endedBy} />;
}
