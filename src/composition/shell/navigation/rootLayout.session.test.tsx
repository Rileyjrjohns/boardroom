import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { createI18n } from '@core/presentation/i18n/createI18n';
import { setDeviceLanguages } from '@core/presentation/i18n/testing/setDeviceLanguages';
import { MEETING_ROW_TEST_ID_PATTERN } from '@features/meetings/presentation/testing/meetingFixtures';

import { APP_STATE } from '../session/appState';
import { driveAppState } from '../testing/appState';
import { AUTH_TEST_IDS } from '@features/auth/presentation/testIds';
import { MEETINGS_TEST_IDS } from '@features/meetings/presentation/testIds';
import { demoAccountTestId } from '@core/presentation/testIds';

// The lock on the way back from the background, through the real root layout, the real route files
// and the real composition root in its mock configuration (the grace period of the real
// configuration, the clock of the system, the biometrics that always recognise the user): the flow
// that `.maestro/lock-on-resume.yaml` runs on a device. Only the language of the device, the clock
// (Jest's fake timers) and the life of the app are driven by the test.

const initial = process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
const ALICE = 'alice.martin@boardroom.example';
const MILLIS_PER_SECOND = 1000;
/** The grace period of the composition root is 30 seconds (`APP_LOCK_GRACE_PERIOD`). */
const BEFORE_GRACE_PERIOD_MILLIS = 20 * MILLIS_PER_SECOND;
const AFTER_GRACE_PERIOD_MILLIS = 35 * MILLIS_PER_SECOND;

beforeEach(() => {
  setDeviceLanguages('en');
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  if (initial === undefined) delete process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS;
  else process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS = initial;
});

async function signIn(): Promise<void> {
  fireEvent.press(await screen.findByTestId(demoAccountTestId(ALICE)));
  fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signInSubmit));
  await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN);
}

function start() {
  const appState = driveAppState();
  return { appState, ...renderRouter() };
}

/** The user leaves the app for `away` milliseconds, then comes back. */
async function awayFor(appState: ReturnType<typeof driveAppState>, away: number): Promise<void> {
  act(() => {
    appState.emit(APP_STATE.Inactive);
  });
  act(() => {
    appState.emit(APP_STATE.Background);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(away);
  });
  await act(async () => {
    appState.emit(APP_STATE.Active);
  });
}

describe('the lock on resume, with the real composition root', () => {
  it('leaves the list where it was when the user is back before the grace period is over', async () => {
    const { appState, getPathname } = start();
    await signIn();

    await awayFor(appState, BEFORE_GRACE_PERIOD_MILLIS);

    expect(screen.getByTestId(MEETINGS_TEST_IDS.meetingsList)).toBeTruthy();
    expect(screen.queryByTestId(AUTH_TEST_IDS.lockScreen)).toBeNull();
    expect(getPathname()).toBe('/');
  });

  it('shows the lock screen, and nothing of the meetings, after the grace period, and unlocks with the biometrics', async () => {
    const { appState, getPathname } = start();
    await signIn();

    await awayFor(appState, AFTER_GRACE_PERIOD_MILLIS);

    expect(await screen.findByTestId(AUTH_TEST_IDS.lockScreen)).toBeTruthy();
    expect(getPathname()).toBe('/lock');
    expect(screen.queryByTestId(MEETINGS_TEST_IDS.meetingsList)).toBeNull();
    expect(screen.queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)).toEqual([]);

    await act(async () => {
      fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.lockUnlock));
    });

    expect(await screen.findByTestId(MEETINGS_TEST_IDS.meetingsList)).toBeTruthy();
    expect(await screen.findAllByTestId(MEETING_ROW_TEST_ID_PATTERN)).not.toHaveLength(0);
    expect(screen.queryByTestId(AUTH_TEST_IDS.lockScreen)).toBeNull();
    expect(getPathname()).toBe('/');
  });

  it('offers to sign out from the lock screen, and goes back to the sign-in screen', async () => {
    const { appState } = start();
    const { t } = createI18n('en');
    await signIn();
    await awayFor(appState, AFTER_GRACE_PERIOD_MILLIS);
    await screen.findByTestId(AUTH_TEST_IDS.lockScreen);

    fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.lockSignOut));
    expect(await screen.findByTestId(AUTH_TEST_IDS.signOutDialog)).toHaveTextContent(
      t('signOut.title'),
      { exact: false },
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signOutConfirm));
    });

    expect(await screen.findByTestId(AUTH_TEST_IDS.signInScreen)).toBeTruthy();
    expect(screen.queryByTestId(AUTH_TEST_IDS.lockScreen)).toBeNull();
  });
});
