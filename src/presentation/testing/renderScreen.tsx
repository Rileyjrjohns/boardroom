import { render, renderHook } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakes } from '@application/testing/createFakes';
import { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import { ListMeetings } from '@application/use-cases/meetings/ListMeetings';

import { createFormatters } from '../format/formatters';
import { FALLBACK_LANGUAGE } from '../i18n/constants';
import type { SupportedLanguage } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { I18nProvider } from '../i18n/I18nProvider';
import { AppProviders, createAppState } from '../services/AppProviders';
import type { AppServices } from '../services/AppServices';

import { trackClient } from './queryClients';

// Test support, not production code: only tests import it (a lint rule enforces it).

/** The page size of the tests: small, so that a handful of meetings makes several pages. */
export const TEST_PAGE_SIZE = 3;

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
function createTestServices(fakes: TestFakes, pageSize = TEST_PAGE_SIZE): AppServices {
  return {
    useCases: {
      listMeetings: new ListMeetings(fakes),
      getMeeting: new GetMeeting(fakes),
    },
    settings: { meetingsPageSize: pageSize },
  };
}

export interface RenderScreenOptions {
  /** The ports under the use cases. A new set by default. */
  readonly fakes?: TestFakes;
  readonly language?: SupportedLanguage;
  readonly pageSize?: number;
}

/**
 * What a test renders into: the real providers of the app (`AppProviders`, with the real query
 * client and the real interface store, and its cache policy), the real translations and the real
 * use cases over the fakes of the ports. The one thing changed is the delay of the retries, which
 * is zero. Returns the wrapper, and what a test needs to hold on to.
 */
function createHarness(options: RenderScreenOptions) {
  const fakes = options.fakes ?? createFakes();
  const language = options.language ?? FALLBACK_LANGUAGE;
  const services = createTestServices(fakes, options.pageSize);
  const state = createAppState({ retryDelay: () => 0 });
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
