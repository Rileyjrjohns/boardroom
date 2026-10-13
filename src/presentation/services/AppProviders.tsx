import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { createQueryClient } from '../query/createQueryClient';
import { UiStoreProvider } from '../state/uiStore';

import { AppServicesProvider } from './AppServices';
import type { AppServices } from './AppServices';

interface AppProvidersProps {
  /** What the composition root built: the use cases and the settings. */
  readonly services: AppServices;
  readonly children: ReactNode;
}

/**
 * Everything a screen needs above it, in one place: the use cases, the query client of this app
 * instance and the store of the interface state. The query client and the store are created here,
 * once, on the first render, so each instance of the app has its own. The root layout mounts this
 * and nothing else of the layer's state.
 */
export function AppProviders({ services, children }: AppProvidersProps) {
  const [queryClient] = useState(() => createQueryClient());

  return (
    <AppServicesProvider services={services}>
      <QueryClientProvider client={queryClient}>
        <UiStoreProvider>{children}</UiStoreProvider>
      </QueryClientProvider>
    </AppServicesProvider>
  );
}
