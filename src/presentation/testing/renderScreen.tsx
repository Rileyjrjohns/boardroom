import { render, renderHook } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakes } from '@application/testing/createFakes';
import { EvaluateAppLock } from '@application/use-cases/auth/EvaluateAppLock';
import { GetCurrentUser } from '@application/use-cases/auth/GetCurrentUser';
import { RestoreSession } from '@application/use-cases/auth/RestoreSession';
import { SignIn } from '@application/use-cases/auth/SignIn';
import { SignOut } from '@application/use-cases/auth/SignOut';
import { UnlockApp } from '@application/use-cases/auth/UnlockApp';
import { ObserveConnectivity } from '@application/use-cases/connectivity/ObserveConnectivity';
import { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import { ListMeetings } from '@application/use-cases/meetings/ListMeetings';
import { AcknowledgeRejectedVote } from '@application/use-cases/votes/AcknowledgeRejectedVote';
import { CastVote } from '@application/use-cases/votes/CastVote';
import { ListPendingVotes } from '@application/use-cases/votes/ListPendingVotes';
import { SyncPendingVotes } from '@application/use-cases/votes/SyncPendingVotes';
import { aDuration } from '@domain/testing/builders';
import type { Duration } from '@domain/value-objects/Duration';

import { createFormatters } from '../format/formatters';
import { FALLBACK_LANGUAGE } from '../i18n/constants';
import type { SupportedLanguage } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppProviders, createAppState } from '../services/AppProviders';
import type { AppServices, DemoAccount } from '../services/AppServices';
import { ACCESS } from '../state/uiStore';
import type { Access } from '../state/uiStore';

import { FakeDemoNetwork } from './FakeDemoNetwork';
import { trackClient } from './queryClients';

// Test support, not production code: only tests import it (a lint rule enforces it).

/** The page size of the tests: small, so that a handful of meetings makes several pages. */
export const TEST_PAGE_SIZE = 3;

/** How long the app may stay in the background without asking for the biometrics again. */
export const TEST_GRACE_PERIOD_MILLIS = 30_000;

/** The accounts of the simulated server in a test that renders the demo controls. */
export const TEST_DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { fullName: 'Alice Martin', email: 'alice.martin@boardroom.example', password: 'demo-password' },
  { fullName: 'Bruno Durand', email: 'bruno.durand@boardroom.example', password: 'demo-password' },
];

/** The fakes of the application ports, as `createFakes` builds them. */
export type TestFakes = ReturnType<typeof createFakes>;

/** The device of the tests: a phone with no inset. */
const SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
} as const;

/**
 * The services the screens take, built from the fakes with the real use cases: no use case is
 * replaced, only the ports under them, so a screen is tested through the same code as the app.
 */
function createTestServices(
  fakes: TestFakes,
  pageSize: number,
  gracePeriod: Duration,
  demo: FakeDemoNetwork | undefined,
): AppServices {
  return {
    useCases: {
      restoreSession: new RestoreSession(fakes),
      signIn: new SignIn(fakes),
      signOut: new SignOut(fakes),
      evaluateAppLock: new EvaluateAppLock({ ...fakes, gracePeriod }),
      unlockApp: new UnlockApp(fakes),
      getCurrentUser: new GetCurrentUser(fakes),
      listMeetings: new ListMeetings(fakes),
      getMeeting: new GetMeeting(fakes),
      observeConnectivity: new ObserveConnectivity(fakes),
      castVote: new CastVote(fakes),
      syncPendingVotes: new SyncPendingVotes(fakes),
      listPendingVotes: new ListPendingVotes(fakes),
      acknowledgeRejectedVote: new AcknowledgeRejectedVote(fakes),
    },
    settings: { meetingsPageSize: pageSize },
    clock: fakes.clock,
    ...(demo === undefined
      ? {}
      : { demoControls: { network: demo, accounts: TEST_DEMO_ACCOUNTS } }),
  };
}

export interface RenderScreenOptions {
  /** The ports under the use cases. A new set by default. */
  readonly fakes?: TestFakes;
  readonly language?: SupportedLanguage;
  readonly pageSize?: number;
  /**
   * Where the user stands. The screens of the open app are rendered unlocked, which is the default;
   * a test of the start or of the session says otherwise.
   */
  readonly access?: Access;
  /** The grace period of the lock, in milliseconds. */
  readonly gracePeriodMillis?: number;
  /** Gives the services the demo controls of the mock configuration, over the fakes. */
  readonly demo?: boolean;
}

/**
 * What a test renders into: the real providers of the app (`AppProviders`, with the real query
 * client and the real interface store, and its cache policy), the real translations and the real
 * use cases over the fakes of the ports. The one thing changed is the delay of the retries, which
 * is zero. Returns the wrapper, and what a test needs to hold on to.
 */
export function createHarness(options: RenderScreenOptions) {
  const fakes = options.fakes ?? createFakes();
  const language = options.language ?? FALLBACK_LANGUAGE;
  const demoNetwork = options.demo === true ? new FakeDemoNetwork(fakes) : undefined;
  const services = createTestServices(
    fakes,
    options.pageSize ?? TEST_PAGE_SIZE,
    aDuration(options.gracePeriodMillis ?? TEST_GRACE_PERIOD_MILLIS),
    demoNetwork,
  );
  const state = createAppState({ retryDelay: () => 0, access: options.access ?? ACCESS.Unlocked });
  trackClient(state.queryClient);

  function Providers({ children }: { readonly children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <I18nProvider language={language}>
          <AppProviders services={services} state={state}>
            {children}
          </AppProviders>
        </I18nProvider>
      </SafeAreaProvider>
    );
  }

  return {
    Providers,
    fakes,
    queryClient: state.queryClient,
    uiStore: state.uiStore,
    services,
    state,
    demoNetwork,
    t: createI18n(language).t,
    format: createFormatters(language),
  };
}

/**
 * Renders a screen the way the app does (see `createHarness`). Returns what the testing library
 * returns, plus the fakes to script the world, the query client, a translator in the language of
 * the render and the formatters of that language, so that a test compares the screen with the same
 * sources of text as the app and never with a copy of a sentence.
 *
 * The providers are the `wrapper` of the render: `rerender` keeps their state, which is how a test
 * leaves a screen and comes back to it.
 */
export function renderScreen(ui: ReactElement, options: RenderScreenOptions = {}) {
  const { Providers, ...harness } = createHarness(options);

  return { ...render(ui, { wrapper: Providers }), ...harness };
}

/** Renders a hook inside the same providers as `renderScreen`. */
export function renderScreenHook<Result>(hook: () => Result, options: RenderScreenOptions = {}) {
  const { Providers, ...harness } = createHarness(options);

  return { ...renderHook(hook, { wrapper: Providers }), ...harness };
}
