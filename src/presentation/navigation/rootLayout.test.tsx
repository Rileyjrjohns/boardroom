import { act, fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StatusBar } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { setDeviceLanguages } from '../i18n/testing/setDeviceLanguages';
import { TEST_IDS } from '../testIds';
import { MEETING_ROW_TEST_ID_PATTERN } from '../testing/meetingFixtures';
import { statusBarStyle } from '../theme/tokens';

// Renders the real route tree, app/_layout.tsx and its routes included, the way expo-router does on
// a device, with the real composition root behind it (the in-memory adapters, and a simulated
// server that answers after its latency: the testing library moves the fake timers while it
// waits). It is the test that notices a root layout which stops mounting a provider: the screens
// would render raw translation keys, or fail for want of the use cases. Only the language of the
// device and the environment variable are set by the tests; i18next, react-i18next, TanStack Query
// and the use cases are the real ones.

// The native header of a screen of the stack, which holds its title.
const HEADER_CONFIGURATION = 'RNSScreenStackHeaderConfig';

const initial = process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
const initialDevelopment = __DEV__;

// The bundler defines the flag as a global, which TypeScript only knows as a constant.
function setDevelopmentFlag(value: boolean): void {
  Object.assign(globalThis, { __DEV__: value });
}

afterEach(() => {
  setDevelopmentFlag(initialDevelopment);
  // renderRouter switches to fake timers.
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
});

/** The style of the system bar content that the screen on display asks for, one entry for each. */
function statusBarStyles(): unknown[] {
  return screen.UNSAFE_queryAllByType(StatusBar).map((bar) => bar.props.barStyle);
}

/** What the test renderer gives back for a host component. */
interface RenderedNode {
  readonly type: string;
  readonly props: Readonly<Record<string, unknown>>;
  readonly children: readonly (RenderedNode | string)[] | null;
}

/** The titles of the headers of the screens of the stack, from the first screen to the last. */
function headerTitles(): string[] {
  const titles: string[] = [];
  const visit = (node: RenderedNode | string): void => {
    if (typeof node === 'string') return;
    if (node.type === HEADER_CONFIGURATION && typeof node.props.title === 'string') {
      titles.push(node.props.title);
    }
    node.children?.forEach(visit);
  };
  const rendered = screen.toJSON() as RenderedNode | RenderedNode[] | null;
  [rendered ?? []].flat().forEach(visit);
  return titles;
}

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

    it('opens the detail of a meeting once, however many times its row is tapped', async () => {
      setDeviceLanguages('en');
      const { getPathname } = renderRouter();
      const [row] = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);

      fireEvent.press(row!);
      fireEvent.press(row!);
      await screen.findByTestId(TEST_IDS.meetingDetail);
      const detail = getPathname();
      act(() => {
        router.back();
      });

      // One screen was stacked, so one step back is the list.
      expect(detail).toMatch(/^\/meetings\/meeting-/);
      await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
      expect(getPathname()).toBe('/');
    });

    it.each([
      ['en', 'Meetings', 'Meeting'],
      ['fr', 'Réunions', 'Réunion'],
    ] as const)(
      'titles the list and the detail of a meeting in the header, in %s',
      async (language, listTitle, detailTitle) => {
        setDeviceLanguages(language);
        const { t } = createI18n(language);
        renderRouter();
        const [row] = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
        expect(headerTitles()).toEqual([listTitle]);

        fireEvent.press(row!);
        await screen.findByTestId(TEST_IDS.meetingDetail);

        expect(headerTitles()).toEqual([listTitle, detailTitle]);
        expect(t('navigation.meeting')).toBe(detailTitle);
      },
    );

    it('asks for dark system bar content on the list and on the detail of a meeting', async () => {
      setDeviceLanguages('en');
      renderRouter();
      const [row] = await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
      expect(statusBarStyles()).toEqual([statusBarStyle]);

      fireEvent.press(row!);
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(statusBarStyles()).toEqual([statusBarStyle]);
    });

    it('asks for dark system bar content once the session has ended', async () => {
      setDeviceLanguages('en');
      renderRouter();
      await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
      // A working day later the session of the simulated server has expired.
      act(() => {
        jest.setSystemTime(Date.now() + 9 * 3_600_000);
      });

      await act(async () => {
        screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.onRefresh();
      });

      await screen.findByTestId(TEST_IDS.sessionEnded);
      expect(statusBarStyles()).toEqual([statusBarStyle]);
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
      expect(statusBarStyles()).toEqual([statusBarStyle]);
    });

    it('says a setting it does not know is invalid, in the language of the device', () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'staging';
      setDeviceLanguages('fr');
      const { t } = createI18n('fr');

      renderRouter();

      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'invalidAdaptersSetting' }))).toBeTruthy();
    });

    it('does not start the mock adapters in a build that is not a development one when the setting is missing', () => {
      delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
      setDevelopmentFlag(false);
      setDeviceLanguages('en');
      const { t } = createI18n('en');

      renderRouter();

      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'missingAdaptersSetting' }))).toBeTruthy();
      expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    });

    it('starts the mock adapters in a build that is not a development one when they are asked for', async () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'mock';
      setDevelopmentFlag(false);
      setDeviceLanguages('en');

      renderRouter();

      await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
      expect(screen.queryByTestId(TEST_IDS.startupFailure)).toBeNull();
    });
  });
});
