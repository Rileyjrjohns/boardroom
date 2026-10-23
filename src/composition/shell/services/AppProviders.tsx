import { QueryClientProvider } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { BannerNoticesProvider } from '@core/presentation/components/StatusBanner';
import { ErrorCatalogProvider } from '@core/presentation/errors/ErrorCatalog';
import { createQueryClient, discardSessionData } from '@core/presentation/query/createQueryClient';
import type { QueryClientOptions } from '@core/presentation/query/createQueryClient';
import { CoreServicesProvider } from '@core/presentation/services/CoreServices';
import type { CoreServices } from '@core/presentation/services/CoreServices';
import { ActionEpochProvider } from '@core/presentation/state/actionEpoch';
import { UiStoreProvider, createUiStore } from '@core/presentation/state/uiStore';
import type { UiStore } from '@core/presentation/state/uiStore';
import { isSessionEndingCode } from '@features/auth/application/session/sessionPolicy';
import { AuthServicesProvider } from '@features/auth/presentation/services/AuthServices';
import {
  ACCESS,
  AccessStoreProvider,
  createAccessStore,
} from '@features/auth/presentation/state/accessStore';
import type { Access, AccessStore } from '@features/auth/presentation/state/accessStore';
import { DocumentsServicesProvider } from '@features/documents/presentation/services/DocumentsServices';
import { MeetingsServicesProvider } from '@features/meetings/presentation/services/MeetingsServices';
import {
  MeetingsStoreProvider,
  createMeetingsStore,
} from '@features/meetings/presentation/state/meetingsStore';
import type { MeetingsStore } from '@features/meetings/presentation/state/meetingsStore';
import { ResolutionActionsProvider } from '@features/meetings/presentation/slots/resolutionActions';
import { SYNC_SUMMARY_NOTICES } from '@features/votes/presentation/components/SyncSummaryNotice';
import { VotesServicesProvider } from '@features/votes/presentation/services/VotesServices';
import {
  VoteSyncStoreProvider,
  createVoteSyncStore,
} from '@features/votes/presentation/state/voteSyncStore';
import type { VoteSyncStore } from '@features/votes/presentation/state/voteSyncStore';
import { VOTE_RESOLUTION_ACTIONS } from '@features/votes/presentation/slots/voteResolutionActions';

import { ERROR_CATALOG } from '../errorCatalog';

import { AppServicesProvider } from './AppServices';
import type { AppServices } from './AppServices';

/** The state of one app instance that lives outside the components. */
export interface AppState {
  readonly queryClient: QueryClient;
  /** What belongs to no feature: the connection, the privacy cover, the notice of a reset. */
  readonly uiStore: UiStore;
  /** Where the user stands: `auth`'s. */
  readonly accessStore: AccessStore;
  /** The period of the meetings list that is selected: the meetings'. */
  readonly meetingsStore: MeetingsStore;
  /** What the synchronisations of the votes did, until the user has read it: the votes'. */
  readonly voteSyncStore: VoteSyncStore;
}

export interface AppStateOptions extends Pick<QueryClientOptions, 'retryDelay'> {
  /** Where the user stands at the start. A test that renders a screen of the open app skips ahead. */
  readonly access?: Access;
  /** Whether the user is to be told that local data was reset. */
  readonly localDataReset?: boolean;
}

/**
 * The query client and the stores of one app instance, wired to each other so that no data of a
 * session outlives it. Each store is its owner's (the access is `auth`'s, the period of the list the
 * meetings', the summary of a synchronisation the votes'); this is the one place that connects them
 * to the query client, which belongs to none:
 *
 * - when a failure ends the session, the query client tells the access why (the user is sent to the
 *   sign-in or the lock screen) and empties its cache;
 * - whenever the user leaves the open app by any other way (they sign out, the lock is required on
 *   the way back from the background), the cache is emptied as well. It happens as the access
 *   changes, before the screens that show data are gone: they are removed by the navigator in the
 *   same update, and a query that is built again on the empty cache is answered with the lock or
 *   the missing session, which the access ignores since the user has already left.
 *
 * `AppProviders` calls this once per instance; a test calls it to hold on to the client, and may
 * give the delay of the retries and where the user stands.
 */
export function createAppState(options: AppStateOptions = {}): AppState {
  const { access, localDataReset, ...clientOptions } = options;
  const accessStore = createAccessStore(access === undefined ? {} : { access });
  const uiStore = createUiStore(localDataReset === undefined ? {} : { localDataReset });
  const meetingsStore = createMeetingsStore();
  const voteSyncStore = createVoteSyncStore(accessStore);
  const queryClient = createQueryClient({
    ...clientOptions,
    errorCatalog: ERROR_CATALOG,
    isSessionEndingCode,
    onSessionEnded: (code, startedUnder) => {
      if (!isSessionEndingCode(code)) return;
      const { accessEpoch, endSession } = accessStore.getState();
      endSession(code, startedUnder ?? accessEpoch);
    },
  });
  accessStore.subscribe((state, previous) => {
    if (previous.access === ACCESS.Unlocked && state.access !== ACCESS.Unlocked) {
      discardSessionData(queryClient);
    }
  });
  return { queryClient, uiStore, accessStore, meetingsStore, voteSyncStore };
}

interface AppProvidersProps {
  /** What the composition root built: the use cases and the settings. */
  readonly services: AppServices;
  /** The state to use instead of a new one: for a test that needs the client. */
  readonly state?: AppState;
  readonly children: ReactNode;
}

/** The part of the services the shared components take: the controls of the demo, the notices. */
function coreServicesOf({ demoControls, notices }: AppServices): CoreServices {
  return {
    ...(demoControls === undefined ? {} : { demoControls }),
    ...(notices === undefined ? {} : { notices }),
  };
}

/**
 * Everything a screen needs above it, in one place: the services and the state of each feature, the
 * shared ones, the query client of this app instance, and what the features plug into each other's
 * slots. The query client and the stores are created here, once, on the first render, so each
 * instance of the app has its own. The root layout mounts this and nothing else of the layer's
 * state; what decides which screens the user can reach is the navigator (`AppNavigator`) and the
 * session controller (`SessionController`), inside it.
 *
 * A feature reads its use cases and its state from its own context and never imports this: the
 * values come from `services`, which the composition root built, and from the state created here.
 *
 * Two links between the features are made here, because no feature may make them:
 *
 * - the banner of the screens tells what the votes synchronised (`BannerNotices`, declared by the
 *   shared banner, implemented by the votes);
 * - a resolution of a meeting offers the vote (`ResolutionActionsSlot`, declared by the meetings,
 *   implemented by the votes).
 */
export function AppProviders({ services, state, children }: AppProvidersProps) {
  const [{ queryClient, uiStore, accessStore, meetingsStore, voteSyncStore }] = useState(
    () => state ?? createAppState({ localDataReset: services.notices?.localDataReset ?? false }),
  );
  const { useCases, settings } = services;
  const core = useMemo(() => coreServicesOf(services), [services]);
  const meetings = useMemo(
    () => ({
      listMeetings: useCases.listMeetings,
      getMeeting: useCases.getMeeting,
      pageSize: settings.meetingsPageSize,
    }),
    [useCases, settings],
  );
  const readEpoch = useMemo(() => () => accessStore.getState().accessEpoch, [accessStore]);

  return (
    <AppServicesProvider services={services}>
      <CoreServicesProvider services={core}>
        <ErrorCatalogProvider catalog={ERROR_CATALOG}>
          <ActionEpochProvider read={readEpoch}>
            <QueryClientProvider client={queryClient}>
              <UiStoreProvider store={uiStore}>
                <AccessStoreProvider store={accessStore}>
                  <MeetingsStoreProvider store={meetingsStore}>
                    <VoteSyncStoreProvider store={voteSyncStore}>
                      <AuthServicesProvider services={useCases}>
                        <MeetingsServicesProvider services={meetings}>
                          <DocumentsServicesProvider services={useCases}>
                            <VotesServicesProvider services={useCases}>
                              <BannerNoticesProvider notices={SYNC_SUMMARY_NOTICES}>
                                <ResolutionActionsProvider slot={VOTE_RESOLUTION_ACTIONS}>
                                  {children}
                                </ResolutionActionsProvider>
                              </BannerNoticesProvider>
                            </VotesServicesProvider>
                          </DocumentsServicesProvider>
                        </MeetingsServicesProvider>
                      </AuthServicesProvider>
                    </VoteSyncStoreProvider>
                  </MeetingsStoreProvider>
                </AccessStoreProvider>
              </UiStoreProvider>
            </QueryClientProvider>
          </ActionEpochProvider>
        </ErrorCatalogProvider>
      </CoreServicesProvider>
    </AppServicesProvider>
  );
}
