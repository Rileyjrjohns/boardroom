import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { setDeviceLanguages } from '../i18n/testing/setDeviceLanguages';
import { TEST_IDS } from '../testIds';
import { MEETING_ROW_TEST_ID_PATTERN } from '../testing/meetingFixtures';

// Renders the real route tree, app/_layout.tsx and its routes included, the way expo-router does on
// a device, with the real composition root behind it (the in-memory adapters, and a simulated
// server that answers after its latency: the testing library moves the fake timers while it
// waits). It is the test that notices a root layout which stops mounting a provider: the screens
// would render raw translation keys, or fail for want of the use cases. Only the language of the
// device and the environment variable are set by the tests; i18next, react-i18next, TanStack Query
// and the use cases are the real ones.

const initial = process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;

afterEach(() => {
  // renderRouter switches to fake timers.
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
});

describe('root layout', () => {
  describe('with the mock adapters, which is the default', () => {
    it.each(SUPPORTED_LANGUAGES)(
      'provides the translations, the use cases and the stores to the meetings list in %s',
      async (language) => {
        setDeviceLanguages(language);
        const { t } = createI18n(language);

        renderRouter();

        expect(
          screen.getByRole('tab', { name: t('meetings.period.upcoming'), selected: true }),
        ).toBeTruthy();
        const rows = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
        expect(rows.length).toBeGreaterThan(0);
        expect(screen.queryByTestId(TEST_IDS.startupFailure)).toBeNull();
      },
    );

    it('follows a regional variant of the device language', async () => {
      setDeviceLanguages('fr-CA', 'en-US');
      const french = createI18n('fr');
      const english = createI18n('en');

      renderRouter();

      expect(screen.getByRole('tab', { name: french.t('meetings.period.past') })).toBeTruthy();
      expect(screen.queryByRole('tab', { name: english.t('meetings.period.past') })).toBeNull();
      await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
    });

    it('opens the detail of a meeting that is tapped, and shows it', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      const { getPathname } = renderRouter();
      const [row] = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);

      fireEvent.press(row!);

      await screen.findByTestId(TEST_IDS.meetingDetail);
      expect(getPathname()).toMatch(/^\/meetings\/meeting-/);
      expect(screen.getByRole('header', { name: t('meeting.agenda') })).toBeTruthy();
    });

    it('opens a meeting that does not exist as not found', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      renderRouter();
      await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);

      // A deep link to a meeting that the server does not know.
      act(() => {
        router.push('/meetings/does-not-exist');
      });

      await screen.findByTestId(TEST_IDS.meetingNotFound);
      expect(screen.getByText(t('errors.notFound'))).toBeTruthy();
    });
  });

  describe('with a setting that cannot be honoured', () => {
    it('says the http adapters are not available yet, instead of starting the mock ones', () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'http';
      setDeviceLanguages('en');
      const { t } = createI18n('en');

      renderRouter();

      expect(screen.getByTestId(TEST_IDS.startupFailure)).toBeTruthy();
      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(
        screen.getByText(t('startup.code', { code: 'configurationNotAvailable' })),
      ).toBeTruthy();
      expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    });

    it('says a setting it does not know is invalid, in the language of the device', () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'staging';
      setDeviceLanguages('fr');
      const { t } = createI18n('fr');

      renderRouter();

      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'invalidAdaptersSetting' }))).toBeTruthy();
    });
  });
});
