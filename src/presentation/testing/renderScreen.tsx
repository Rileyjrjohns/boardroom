import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createFakes } from '@application/testing/createFakes';
import { GetMeeting } from '@application/use-cases/meetings/GetMeeting';
import { ListMeetings } from '@application/use-cases/meetings/ListMeetings';

import { createDateTimeFormatter } from '../format/dateTime';
import { FALLBACK_LANGUAGE } from '../i18n/constants';
import type { SupportedLanguage } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { I18nProvider } from '../i18n/I18nProvider';
import { createQueryClient } from '../query/createQueryClient';
import { AppServicesProvider } from '../services/AppServices';
import type { AppServices } from '../services/AppServices';
import { UiStoreProvider } from '../state/uiStore';

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
 * Renders a screen the way the app does: with the real translations, the real query client (no
 * retry delay, and no timer to collect the cache), the real interface store and the real use
 * cases over the fakes of the ports. Returns what the testing library returns, plus the fakes to
 * script the world, the query client, a translator in the language of the render and the date
 * formatter of that language, so that a test compares the screen with the same sources of text as
 * the app and never with a copy of a sentence.
 *
 * The providers are the `wrapper` of the render: `rerender` keeps their state, which is how a test
 * leaves a screen and comes back to it.
 */
export function renderScreen(ui: ReactElement, options: RenderScreenOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  const language = options.language ?? FALLBACK_LANGUAGE;
  const services = createTestServices(fakes, options.pageSize);
  const queryClient = createQueryClient({ retryDelay: () => 0, gcTime: Infinity });

  function Providers({ children }: { readonly children: ReactNode }) {
    return (
      <SafeAreaProvider initialMetrics={SAFE_AREA}>
        <I18nProvider language={language}>
          <AppServicesProvider services={services}>
            <QueryClientProvider client={queryClient}>
              <UiStoreProvider>{children}</UiStoreProvider>
            </QueryClientProvider>
          </AppServicesProvider>
        </I18nProvider>
      </SafeAreaProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Providers }),
    fakes,
    queryClient,
    services,
    t: createI18n(language).t,
    format: createDateTimeFormatter(language),
  };
}
