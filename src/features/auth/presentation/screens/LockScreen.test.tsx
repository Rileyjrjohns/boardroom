import { act, fireEvent, screen } from '@testing-library/react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { epochOf } from '@composition/shell/testing/accessEpoch';
import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import {
  biometricCancelled,
  biometricFailed,
  biometricLockedOut,
  biometricNotEnrolled,
  biometricUnavailable,
} from '@features/auth/domain/errors/BiometricError';
import type {
  BiometricAvailabilityError,
  BiometricError,
} from '@features/auth/domain/errors/BiometricError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import type { TranslationKey } from '@core/presentation/i18n/translationKeys';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { createFakes } from '@testing/application/createFakes';
import { renderScreen } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { LockScreen } from './LockScreen';
import { AUTH_TEST_IDS } from '../testIds';
import { CORE_TEST_IDS } from '@core/presentation/testIds';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** The lock screen of an app that has just started: somebody is signed in and the app is locked. */
function renderLock(options: RenderScreenOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  fakes.appLock.lock();
  return renderScreen(<LockScreen />, { access: ACCESS.Locked, ...options, fakes });
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function press(testId: string): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId(testId));
  });
  await settle();
}

describe('LockScreen', () => {
  describe('what it shows', () => {
    it('says the app is locked and offers to unlock it, and to sign out', () => {
      const { t } = renderLock();

      expect(screen.getByRole('header', { name: t('lock.title') })).toBeTruthy();
      expect(screen.getByText(t('lock.message'))).toBeTruthy();
      expect(screen.getByRole('button', { name: t('lock.unlock') })).toBeTruthy();
      expect(screen.getByRole('button', { name: t('signOut.action') })).toBeTruthy();
    });

    it('shows nothing of the user and asks for nothing about them: no name, no email, no meeting', () => {
      const { fakes } = renderLock();
      const user = fakes.auth.session!.user;

      expect(screen.queryByText(user.fullName)).toBeNull();
      expect(screen.queryByText(user.email)).toBeNull();
      expect(screen.queryByText(/Alice/)).toBeNull();
      expect(fakes.meetings.listCalls).toEqual([]);
      expect(fakes.meetings.getCalls).toEqual([]);
    });

    it('has buttons at least as tall as the touch target, and a hint for the unlock', () => {
      const { t } = renderLock();

      expect(screen.getByTestId(AUTH_TEST_IDS.lockUnlock)).toHaveStyle({ minHeight: 44 });
      expect(screen.getByTestId(AUTH_TEST_IDS.lockSignOut)).toHaveStyle({ minHeight: 44 });
      expect(screen.getByTestId(AUTH_TEST_IDS.lockUnlock).props.accessibilityHint).toBe(
        t('lock.unlockHint'),
      );
    });

    it('says why the app is locked when a failure is what sent the user here', () => {
      const { accessStore, t } = renderLock({ access: ACCESS.Unlocked });
      act(() => {
        accessStore.getState().endSession('appLocked', epochOf(accessStore));
      });

      expect(screen.getByTestId(AUTH_TEST_IDS.sessionNotice)).toHaveTextContent(
        t('errors.appLocked'),
      );
    });
  });

  describe('unlocking', () => {
    it('asks for the biometric proof, once, for the right reason, and opens the app', async () => {
      const { fakes, accessStore } = renderLock();

      await press(AUTH_TEST_IDS.lockUnlock);

      expect(fakes.biometricGate.prompts).toEqual([BIOMETRIC_REASON.UnlockApp]);
      expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it('shows the button busy, and asks once however many times it is pressed', async () => {
      const { fakes, t } = renderLock();
      let answer: () => void = () => undefined;
      fakes.biometricGate.onPrompt = () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        });

      await act(async () => {
        fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.lockUnlock));
        fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.lockUnlock));
      });
      await settle();
      fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.lockUnlock));

      expect(
        screen.getByRole('button', { name: t('lock.unlocking') }).props.accessibilityState,
      ).toMatchObject({ busy: true, disabled: true });
      expect(fakes.biometricGate.prompts).toHaveLength(1);
      await act(async () => {
        answer();
      });
      await settle();
    });

    it.each([
      [biometricCancelled(), 'unlockErrors.biometricCancelled'],
      [biometricFailed(), 'unlockErrors.biometricFailed'],
      [biometricLockedOut(), 'unlockErrors.biometricLockedOut'],
    ] as [BiometricError, TranslationKey][])(
      'says what happened, and stays locked, when the prompt ends with %p',
      async (failure, key) => {
        const { fakes, accessStore, t } = renderLock();
        fakes.biometricGate.authentication = err(failure);

        await press(AUTH_TEST_IDS.lockUnlock);

        const message = screen.getByTestId(AUTH_TEST_IDS.lockError);
        expect(message).toHaveTextContent(t(key));
        expect(message.props.accessibilityRole).toBe('alert');
        expect(accessStore.getState().access).toBe(ACCESS.Locked);
        expect(fakes.appLock.isLocked()).toBe(true);
        expect(screen.getByRole('button', { name: t('lock.unlock') })).toBeEnabled();
      },
    );

    it.each([
      [biometricUnavailable(), 'unlockErrors.biometricUnavailable'],
      [biometricNotEnrolled(), 'unlockErrors.biometricNotEnrolled'],
    ] as [BiometricAvailabilityError, TranslationKey][])(
      'says the biometrics cannot be used, without any prompt, when the device answers %p',
      async (failure, key) => {
        const { fakes, accessStore, t } = renderLock();
        fakes.biometricGate.availability = err(failure);

        await press(AUTH_TEST_IDS.lockUnlock);

        expect(screen.getByTestId(AUTH_TEST_IDS.lockError)).toHaveTextContent(t(key));
        expect(fakes.biometricGate.prompts).toEqual([]);
        expect(accessStore.getState().access).toBe(ACCESS.Locked);
      },
    );

    it('says the biometrics cannot be used every time, and leaves signing out as the way forward', async () => {
      const { fakes, accessStore, t } = renderLock();
      fakes.biometricGate.availability = err(biometricNotEnrolled());

      await press(AUTH_TEST_IDS.lockUnlock);
      await press(AUTH_TEST_IDS.lockUnlock);

      expect(accessStore.getState().access).toBe(ACCESS.Locked);
      expect(screen.getByRole('button', { name: t('signOut.action') })).toBeEnabled();

      await press(AUTH_TEST_IDS.lockSignOut);
      await press(AUTH_TEST_IDS.signOutConfirm);

      expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
    });

    it('lets the user try again after a failure, and opens the app when the proof is right', async () => {
      const { fakes, accessStore, t } = renderLock();
      fakes.biometricGate.authentication = err(biometricFailed());
      await press(AUTH_TEST_IDS.lockUnlock);
      expect(screen.getByTestId(AUTH_TEST_IDS.lockError)).toBeTruthy();

      fakes.biometricGate.authentication = ok(undefined);
      await press(AUTH_TEST_IDS.lockUnlock);

      expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
      expect(t('lock.unlock')).toBeTruthy();
    });

    it('does not prompt again by itself, nor on its own when shown', async () => {
      const { fakes } = renderLock();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60_000);
      });

      expect(fakes.biometricGate.prompts).toEqual([]);
    });
  });

  describe('signing out from the lock screen', () => {
    it('asks for a confirmation that says, in general terms, that waiting votes are kept', async () => {
      const { t } = renderLock();

      await press(AUTH_TEST_IDS.lockSignOut);

      expect(screen.getByRole('header', { name: t('signOut.title') })).toBeTruthy();
      expect(screen.getByText(t('signOut.message'))).toBeTruthy();
      expect(screen.getByTestId(AUTH_TEST_IDS.signOutPending)).toHaveTextContent(
        t('signOut.pendingUnknown'),
      );
    });

    it('signs out when confirmed: the session is forgotten, and the user goes to the sign-in screen', async () => {
      const { fakes, accessStore } = renderLock();

      await press(AUTH_TEST_IDS.lockSignOut);
      await press(AUTH_TEST_IDS.signOutConfirm);

      expect(fakes.auth.signOutCalls).toBe(1);
      expect(fakes.auth.session).toBeUndefined();
      expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
    });

    it('does nothing when cancelled', async () => {
      const { fakes, accessStore } = renderLock();

      await press(AUTH_TEST_IDS.lockSignOut);
      await press(AUTH_TEST_IDS.signOutCancel);

      expect(screen.queryByTestId(AUTH_TEST_IDS.signOutDialog)).toBeNull();
      expect(fakes.auth.signOutCalls).toBe(0);
      expect(accessStore.getState().access).toBe(ACCESS.Locked);
    });

    it('says when the session could not be forgotten, and lets the user try again', async () => {
      const { fakes, accessStore, t } = renderLock();
      fakes.auth.signOutFailure = storageWriteFailed();
      await press(AUTH_TEST_IDS.lockSignOut);

      await press(AUTH_TEST_IDS.signOutConfirm);

      expect(screen.getByTestId(AUTH_TEST_IDS.signOutError)).toHaveTextContent(t('signOut.failed'));
      expect(accessStore.getState().access).toBe(ACCESS.Locked);

      fakes.auth.signOutFailure = undefined;
      await press(AUTH_TEST_IDS.signOutConfirm);
      expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
    });
  });

  describe('a prompt that fails in a way the use case does not know', () => {
    it('says something went wrong instead of crashing, when the prompt rejects instead of answering', async () => {
      const { fakes, t } = renderLock();
      fakes.biometricGate.onPrompt = () => {
        throw new Error('boom');
      };

      await press(AUTH_TEST_IDS.lockUnlock);

      expect(screen.getByTestId(AUTH_TEST_IDS.lockError)).toHaveTextContent(t('errors.unexpected'));
    });
  });

  describe('a device that is offline', () => {
    it('says so at the top, and nothing when the connection is there', () => {
      const { t, uiStore } = renderLock();
      expect(screen.queryByTestId(CORE_TEST_IDS.offlineBanner)).toBeNull();

      act(() => {
        uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
      });

      expect(screen.getByTestId(CORE_TEST_IDS.offlineBanner)).toHaveTextContent(
        t('banner.offline'),
      );
      act(() => {
        uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Online);
      });
      expect(screen.queryByTestId(CORE_TEST_IDS.offlineBanner)).toBeNull();
    });

    it('offers the switch of the demo in the mock configuration only', () => {
      const demo = renderLock({ demo: true });
      expect(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch)).toBeTruthy();
      demo.unmount();

      renderLock();
      expect(screen.queryByTestId(CORE_TEST_IDS.demoOfflineSwitch)).toBeNull();
    });

    it('keeps the unlock and the sign-out where they were', () => {
      renderLock({ demo: true });

      expect(screen.getByTestId(AUTH_TEST_IDS.lockUnlock)).toBeTruthy();
      expect(screen.getByTestId(AUTH_TEST_IDS.lockSignOut)).toBeTruthy();
    });
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)('is written in %s, failure included', async (language) => {
      const { fakes, t } = renderLock({ language });
      fakes.biometricGate.authentication = err(biometricLockedOut());

      await press(AUTH_TEST_IDS.lockUnlock);

      expect(screen.getByRole('header', { name: t('lock.title') })).toBeTruthy();
      expect(screen.getByText(t('lock.message'))).toBeTruthy();
      expect(screen.getByTestId(AUTH_TEST_IDS.lockError)).toHaveTextContent(
        t('unlockErrors.biometricLockedOut'),
      );
    });

    it('says in French that the app is locked and how to unlock it', () => {
      renderLock({ language: 'fr' });

      expect(screen.getByRole('header', { name: 'Boardroom est verrouillé' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Déverrouiller' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
    });
  });
});
