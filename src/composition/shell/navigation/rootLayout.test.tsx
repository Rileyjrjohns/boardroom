import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StatusBar } from 'react-native';
import { renderRouter } from 'expo-router/testing-library';

import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import { createI18n } from '@core/presentation/i18n/createI18n';
import { setDeviceLanguages } from '@core/presentation/i18n/testing/setDeviceLanguages';
import {
  TEST_IDS,
  demoAccountTestId,
  resolutionTestId,
  voteChoiceTestId,
  voteOutcomeTestId,
} from '@core/presentation/testIds';
import { statusBarStyle } from '@core/presentation/theme/tokens';
import { MEETING_ROW_TEST_ID_PATTERN } from '@features/meetings/presentation/testing/meetingFixtures';

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
const initialBaseUrl = process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL;
const initialDevelopment = __DEV__;

// The bundler defines the flag as a global, which TypeScript only knows as a constant.
function setDevelopmentFlag(value: boolean): void {
  Object.assign(globalThis, { __DEV__: value });
}

// The real composition root writes its events to the console, through `ConsoleMonitoring`, at the
// level of information (a vote queued, a synchronisation completed...). The root layout is the one
// place that builds it with no way to hand it another monitoring, so the channel it writes to is
// silenced here: only information, which React and React Native do not use for their warnings, so
// that a real warning is still printed and can still be asserted on.
beforeEach(() => {
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  setDevelopmentFlag(initialDevelopment);
  // renderRouter switches to fake timers.
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
  if (initialBaseUrl === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL;
  else process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL = initialBaseUrl;
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

const ALICE = 'alice.martin@boardroom.example';

/** What React says when something updates the state of a component before it was ever mounted. */
const NOT_MOUNTED_YET_WARNING = "hasn't mounted yet";

/**
 * Signs in as the first demo account, with the helper of the sign-in screen that the mock
 * configuration offers, and waits for the meetings list.
 */
async function signInAsAlice(): Promise<void> {
  fireEvent.press(await screen.findByTestId(demoAccountTestId(ALICE)));
  fireEvent.press(screen.getByTestId(TEST_IDS.signInSubmit));
}

/** Signs in and waits for the rows of the list. */
async function openTheList() {
  await signInAsAlice();
  return screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
}

describe('root layout', () => {
  describe('with the mock adapters, which is the default', () => {
    it.each(SUPPORTED_LANGUAGES)(
      'starts signed out, on the sign-in screen with the accounts of the demo, in %s',
      async (language) => {
        setDeviceLanguages(language);
        const { t } = createI18n(language);

        const { getPathname } = renderRouter();

        expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
        expect(getPathname()).toBe('/sign-in');
        expect(screen.getByRole('header', { name: t('signIn.title') })).toBeTruthy();
        expect(screen.getByTestId(demoAccountTestId(ALICE))).toBeTruthy();
        expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
        expect(screen.queryByTestId(TEST_IDS.startupFailure)).toBeNull();
      },
    );

    it('starts without React warning that a component that has not mounted yet was updated', async () => {
      // The warning came from the router, at start-up, before the sign-in screen: see
      // `src/composition/shell/navigation/systemLinks.ts`.
      const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      setDeviceLanguages('en');

      renderRouter();
      await screen.findByTestId(TEST_IDS.signInScreen);

      const warnings = error.mock.calls.filter(([message]) =>
        String(message).includes(NOT_MOUNTED_YET_WARNING),
      );
      expect(warnings).toEqual([]);
    });

    it('signs in with the demo account, and lands on the list unlocked, with the demo switch and the header actions', async () => {
      setDeviceLanguages('en');
      const { getPathname } = renderRouter();

      const rows = await openTheList();

      expect(rows.length).toBeGreaterThan(0);
      expect(getPathname()).toBe('/');
      expect(screen.getByTestId(TEST_IDS.demoOfflineSwitch)).toBeTruthy();
      expect(screen.getByTestId(TEST_IDS.signOutButton)).toBeTruthy();
      expect(screen.getByTestId(TEST_IDS.pendingVotesButton)).toBeTruthy();
    });

    it('refuses the wrong password of a demo account with a message, and stays on the sign-in screen', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      renderRouter();
      fireEvent.press(await screen.findByTestId(demoAccountTestId(ALICE)));
      fireEvent.changeText(screen.getByTestId(TEST_IDS.signInPassword), 'not the password');

      fireEvent.press(screen.getByTestId(TEST_IDS.signInSubmit));

      expect(await screen.findByTestId(TEST_IDS.signInError)).toHaveTextContent(
        t('errors.invalidCredentials'),
      );
      expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    });

    it('signs out from the header, after a confirmation, and returns to the sign-in screen', async () => {
      setDeviceLanguages('en');
      renderRouter();
      await openTheList();

      fireEvent.press(screen.getByTestId(TEST_IDS.signOutButton));
      await act(async () => {
        fireEvent.press(await screen.findByTestId(TEST_IDS.signOutConfirm));
      });

      expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
      expect(screen.queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)).toEqual([]);
    });

    it.each(SUPPORTED_LANGUAGES)(
      'provides the translations, the use cases and the stores to the meetings list in %s',
      async (language) => {
        setDeviceLanguages(language);
        const { t } = createI18n(language);

        renderRouter();
        const rows = await openTheList();

        expect(
          await screen.findByRole('tab', { name: t('meetings.period.upcoming'), selected: true }),
        ).toBeTruthy();
        expect(rows.length).toBeGreaterThan(0);
        expect(screen.queryByTestId(TEST_IDS.startupFailure)).toBeNull();
      },
    );

    it('follows a regional variant of the device language', async () => {
      setDeviceLanguages('fr-CA', 'en-US');
      const french = createI18n('fr');
      const english = createI18n('en');

      renderRouter();
      await openTheList();

      expect(
        await screen.findByRole('tab', { name: french.t('meetings.period.past') }),
      ).toBeTruthy();
      expect(screen.queryByRole('tab', { name: english.t('meetings.period.past') })).toBeNull();
    });

    it('opens the detail of a meeting that is tapped, and shows it', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      const { getPathname } = renderRouter();
      const [row] = await openTheList();

      fireEvent.press(row!);

      await screen.findByTestId(TEST_IDS.meetingDetail);
      expect(getPathname()).toMatch(/^\/meetings\/meeting-/);
      expect(screen.getByRole('header', { name: t('meeting.agenda') })).toBeTruthy();
    });

    it('opens the detail of a meeting once, however many times its row is tapped', async () => {
      setDeviceLanguages('en');
      const { getPathname } = renderRouter();
      const [row] = await openTheList();

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
        const [row] = await openTheList();
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
      expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
      expect(statusBarStyles()).toEqual([statusBarStyle]);
      const [row] = await openTheList();
      expect(statusBarStyles()).toEqual([statusBarStyle]);

      fireEvent.press(row!);
      await screen.findByTestId(TEST_IDS.meetingDetail);

      expect(statusBarStyles()).toEqual([statusBarStyle]);
    });

    it('sends the user to the sign-in screen, with the reason, once the session has expired, and asks for dark system bar content there too', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      renderRouter();
      await openTheList();
      // A working day later the session of the simulated server has expired.
      act(() => {
        jest.setSystemTime(Date.now() + 9 * 3_600_000);
      });

      await act(async () => {
        screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.onRefresh();
      });

      expect(await screen.findByTestId(TEST_IDS.signInScreen)).toBeTruthy();
      expect(screen.getByTestId(TEST_IDS.sessionNotice)).toHaveTextContent(
        t('errors.sessionExpired'),
      );
      expect(screen.queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)).toEqual([]);
      expect(statusBarStyles()).toEqual([statusBarStyle]);
    });

    it('opens a meeting that does not exist as not found', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      renderRouter();
      await openTheList();

      // A deep link to a meeting that the server does not know.
      act(() => {
        router.push('/meetings/does-not-exist');
      });

      await screen.findByTestId(TEST_IDS.meetingNotFound);
      expect(screen.getByText(t('errors.notFound'))).toBeTruthy();
    });
  });

  describe('the offline scenario, with the real composition root', () => {
    /** The id of the resolution of the first choice button on the screen, if there is one. */
    function votableResolution(): string | undefined {
      const choice = screen
        .queryAllByTestId(/^vote-choice-.*-for$/)
        .map((button) => String(button.props.testID))[0];
      return choice?.replace(/^vote-choice-/, '').replace(/-for$/, '');
    }

    /** Opens the meetings of the list in turn until one has a resolution the user may vote on. */
    async function openAMeetingToVoteOn(): Promise<{ meetingPath: string; resolutionId: string }> {
      const { getPathname } = currentApp;
      const rows = await openTheList();
      for (const row of rows.slice(0, 6)) {
        fireEvent.press(row);
        await screen.findByTestId(TEST_IDS.meetingDetail);
        await waitFor(() => {
          expect(screen.queryByTestId(TEST_IDS.votingLoading)).toBeNull();
        });
        const resolutionId = votableResolution();
        if (resolutionId !== undefined) return { meetingPath: getPathname(), resolutionId };
        act(() => {
          router.back();
        });
        await screen.findByTestId(TEST_IDS.meetingsList);
      }
      throw new Error('No meeting of the first rows has a resolution to vote on.');
    }

    let currentApp: ReturnType<typeof renderRouter>;

    it('goes offline, votes on a meeting already seen, sees the vote queued, goes online and sees it sent', async () => {
      setDeviceLanguages('en');
      const { t } = createI18n('en');
      currentApp = renderRouter();
      const { meetingPath, resolutionId } = await openAMeetingToVoteOn();
      act(() => {
        router.back();
      });
      await screen.findByTestId(TEST_IDS.meetingsList);

      // The connection is cut with the switch of the demo; the meeting was seen, so it is saved.
      fireEvent.press(screen.getByTestId(TEST_IDS.demoOfflineSwitch));
      expect(await screen.findByTestId(TEST_IDS.offlineBanner)).toBeTruthy();
      act(() => {
        router.push(meetingPath as '/');
      });
      await screen.findByTestId(TEST_IDS.meetingDetail);
      const choice = await screen.findByTestId(voteChoiceTestId(resolutionId as never, 'for'));

      // The vote is confirmed, then queued: the detail says it is waiting.
      fireEvent.press(choice);
      fireEvent.press(await screen.findByTestId(TEST_IDS.voteConfirm));
      expect(await screen.findByTestId(voteOutcomeTestId(resolutionId as never))).toHaveTextContent(
        t('voting.queued'),
      );
      const resolution = screen.getByTestId(resolutionTestId(resolutionId));
      expect(
        await within(resolution).findByText(
          t('meeting.resolutionYourVoteQueued', { choice: t('voteChoice.for') }),
        ),
      ).toBeTruthy();

      // The connection is back: the vote is sent by itself, and the detail shows it recorded.
      fireEvent.press(screen.getByTestId(TEST_IDS.demoOfflineSwitch));
      await waitFor(() => {
        expect(screen.queryByTestId(TEST_IDS.offlineBanner)).toBeNull();
      });
      expect(
        within(await screen.findByTestId(TEST_IDS.syncSummary)).getByText(
          t('banner.sent', { count: 1, formattedCount: '1' }),
        ),
      ).toBeTruthy();
      expect(
        await within(screen.getByTestId(resolutionTestId(resolutionId))).findByText(
          t('meeting.resolutionYourVote', { choice: t('voteChoice.for') }),
        ),
      ).toBeTruthy();
      // Sent: the words "saved on this device" are gone with the wait.
      expect(screen.queryByTestId(voteOutcomeTestId(resolutionId as never))).toBeNull();
      expect(screen.queryByText(t('voting.queued'))).toBeNull();
    });
  });

  describe('while the app starts', () => {
    it.each([
      ['en', 'Starting Boardroom'],
      ['fr', 'Démarrage de Boardroom'],
    ] as const)('shows a translated loading state first, in %s', async (language, text) => {
      setDeviceLanguages(language);

      renderRouter();

      expect(screen.getByTestId(TEST_IDS.startupLoading)).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: text })).toBeTruthy();
      expect(statusBarStyles()).toEqual([statusBarStyle]);
      await screen.findByTestId(TEST_IDS.signInScreen);
      expect(screen.queryByTestId(TEST_IDS.startupLoading)).toBeNull();
    });
  });

  describe('with a setting that cannot be honoured', () => {
    it('says the address of the API is missing for the http adapters, instead of starting the mock ones', async () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'http';
      delete process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL;
      setDeviceLanguages('en');
      const { t } = createI18n('en');

      renderRouter();

      expect(await screen.findByTestId(TEST_IDS.startupFailure)).toBeTruthy();
      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'missingApiBaseUrl' }))).toBeTruthy();
      expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
      expect(statusBarStyles()).toEqual([statusBarStyle]);
    });

    it('says an address that is not secure is refused for the http adapters in a release build', async () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'http';
      process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL = 'http://api.example.com';
      setDevelopmentFlag(false);
      setDeviceLanguages('en');
      const { t } = createI18n('en');

      renderRouter();

      expect(
        await screen.findByText(t('startup.code', { code: 'insecureApiBaseUrl' })),
      ).toBeTruthy();
    });

    it('says a setting it does not know is invalid, in the language of the device', async () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'staging';
      setDeviceLanguages('fr');
      const { t } = createI18n('fr');

      renderRouter();

      expect(await screen.findByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'invalidAdaptersSetting' }))).toBeTruthy();
    });

    it('does not start the mock adapters in a build that is not a development one when the setting is missing', async () => {
      delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
      setDevelopmentFlag(false);
      setDeviceLanguages('en');
      const { t } = createI18n('en');

      renderRouter();

      expect(await screen.findByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.code', { code: 'missingAdaptersSetting' }))).toBeTruthy();
      expect(screen.queryByTestId(TEST_IDS.meetingsList)).toBeNull();
    });

    it('starts the mock adapters in a build that is not a development one when they are asked for', async () => {
      process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = 'mock';
      setDevelopmentFlag(false);
      setDeviceLanguages('en');

      renderRouter();

      await screen.findByTestId(TEST_IDS.signInScreen);
      expect(screen.queryByTestId(TEST_IDS.startupFailure)).toBeNull();
    });
  });
});
