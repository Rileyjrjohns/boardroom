import { act, fireEvent, screen, within } from '@testing-library/react-native';
import { AccessibilityInfo, Keyboard, Platform, TextInput } from 'react-native';

import { ACCESS } from '@features/auth/presentation/state/accessStore';
import { epochOf } from '@composition/shell/testing/accessEpoch';
import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import {
  invalidCredentials,
  sessionExpired,
} from '@features/auth/domain/errors/AuthenticationError';
import { networkUnavailable, unexpected } from '@core/domain/errors/RepositoryError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { SUPPORTED_LANGUAGES } from '@core/presentation/i18n/constants';
import type { SignInFailure } from '@features/auth/application/ports/AuthSession';
import { DEFAULT_PASSWORD } from '@features/auth/application/testing/FakeAuthSession';
import type { Session } from '@features/auth/domain/entities/Session';
import { createFakes } from '@testing/application/createFakes';
import { aSession, anEmail } from '@testing/domain/builders';
import { TEST_DEMO_ACCOUNTS, renderScreen } from '@testing/presentation/renderScreen';
import type { RenderScreenOptions } from '@testing/presentation/renderScreen';

import { SignInScreen } from './SignInScreen';
import { AUTH_TEST_IDS } from '../testIds';
import { VOTES_TEST_IDS } from '@features/votes/presentation/testIds';
import { demoAccountTestId, CORE_TEST_IDS } from '@core/presentation/testIds';

const EMAIL = 'alice@example.com';

beforeEach(() => {
  jest.useFakeTimers();
  forgetFocusRequests();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/**
 * The fields that were asked for the focus since the last call to `forgetFocusRequests`, in order,
 * by test id. The text input of the jest preset is a mock whose `focus` records the instance it was
 * called on.
 */
function focusRequests(): string[] {
  const focus = TextInput.prototype.focus as unknown as jest.Mock<void, []>;
  return focus.mock.contexts.map((input) =>
    String((input as { props: { testID: string } }).props.testID),
  );
}

function forgetFocusRequests(): void {
  (TextInput.prototype.focus as unknown as jest.Mock).mockClear();
}

/** The sign-in screen of a signed-out user, over fakes with nobody signed in. */
function renderSignIn(options: RenderScreenOptions = {}) {
  const fakes = options.fakes ?? createFakes();
  fakes.auth.session = undefined;
  fakes.appLock.lock();
  return renderScreen(<SignInScreen />, { access: ACCESS.SignedOut, ...options, fakes });
}

function type(testId: string, text: string): void {
  fireEvent.changeText(screen.getByTestId(testId), text);
}

function submit(): void {
  fireEvent.press(screen.getByTestId(AUTH_TEST_IDS.signInSubmit));
}

/** Lets the timers of the query library run: it tells its observers on a timer of its own. */
async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function signInWith(email: string, password: string): Promise<void> {
  type(AUTH_TEST_IDS.signInEmail, email);
  type(AUTH_TEST_IDS.signInPassword, password);
  await act(async () => {
    submit();
  });
  await settle();
}

describe('SignInScreen', () => {
  describe('the form', () => {
    it('has an email field and a password field, each with a visible label that names it', () => {
      const { t } = renderSignIn();

      expect(screen.getByLabelText(t('signIn.email'))).toBe(
        screen.getByTestId(AUTH_TEST_IDS.signInEmail),
      );
      expect(screen.getByLabelText(t('signIn.password'))).toBe(
        screen.getByTestId(AUTH_TEST_IDS.signInPassword),
      );
      expect(screen.getByText(t('signIn.email'))).toBeTruthy();
      expect(screen.getByText(t('signIn.password'))).toBeTruthy();
      expect(screen.getByRole('header', { name: t('signIn.title') })).toBeTruthy();
      expect(screen.getByRole('button', { name: t('signIn.submit') })).toBeTruthy();
    });

    it('asks the keyboard and the password manager for what an email field and a password field need', () => {
      renderSignIn();
      const email = screen.getByTestId(AUTH_TEST_IDS.signInEmail);
      const password = screen.getByTestId(AUTH_TEST_IDS.signInPassword);

      expect(email.props).toMatchObject({
        keyboardType: 'email-address',
        inputMode: 'email',
        autoCapitalize: 'none',
        autoCorrect: false,
        autoComplete: 'username',
        textContentType: 'username',
        returnKeyType: 'next',
      });
      expect(password.props).toMatchObject({
        secureTextEntry: true,
        autoCapitalize: 'none',
        autoCorrect: false,
        autoComplete: 'current-password',
        textContentType: 'password',
        returnKeyType: 'go',
      });
      expect(email.props.secureTextEntry).toBeFalsy();
    });

    it('has a button at least as tall as the touch target', () => {
      renderSignIn();

      expect(screen.getByTestId(AUTH_TEST_IDS.signInSubmit)).toHaveStyle({ minHeight: 44 });
    });
  });

  describe('the validation, with the rules of the domain', () => {
    it.each([
      ['', 'secret', 'signIn.emailRequired'],
      ['   ', 'secret', 'signIn.emailRequired'],
      ['not an email', 'secret', 'signIn.emailInvalid'],
      [`${'a'.repeat(250)}@x.fr`, 'secret', 'signIn.emailTooLong'],
    ] as const)(
      'tells under the email field what is wrong with %p',
      async (email, password, key) => {
        const { fakes, t } = renderSignIn();

        await signInWith(email, password);

        const message = screen.getByTestId(AUTH_TEST_IDS.signInEmailError);
        expect(message).toHaveTextContent(t(key));
        expect(message.props.accessibilityRole).toBe('alert');
        expect(screen.queryByTestId(AUTH_TEST_IDS.signInPasswordError)).toBeNull();
        expect(fakes.auth.signInCalls).toEqual([]);
      },
    );

    it('tells under the password field that it is required, and does not wipe it', async () => {
      const { fakes, t } = renderSignIn();

      await signInWith(EMAIL, '');

      expect(screen.getByTestId(AUTH_TEST_IDS.signInPasswordError)).toHaveTextContent(
        t('signIn.passwordRequired'),
      );
      expect(screen.queryByTestId(AUTH_TEST_IDS.signInEmailError)).toBeNull();
      expect(fakes.auth.signInCalls).toEqual([]);
    });

    it('does not empty the password the user typed when the email is what is wrong', async () => {
      renderSignIn();

      await signInWith('nope', 'secret');

      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.value).toBe('secret');
    });

    it.each([
      ['', 'secret', AUTH_TEST_IDS.signInEmail],
      ['nope', 'secret', AUTH_TEST_IDS.signInEmail],
      [EMAIL, '', AUTH_TEST_IDS.signInPassword],
      ['', '', AUTH_TEST_IDS.signInEmail],
    ])(
      'moves the focus to the first field it refuses, for %p and %p',
      async (email, password, field) => {
        renderSignIn();

        await signInWith(email, password);

        expect(focusRequests()).toEqual([field]);
      },
    );

    it('does not move the focus when the form is accepted', async () => {
      renderSignIn();
      type(AUTH_TEST_IDS.signInEmail, EMAIL);
      type(AUTH_TEST_IDS.signInPassword, DEFAULT_PASSWORD);

      await act(async () => {
        submit();
      });

      expect(focusRequests()).toEqual([]);
    });

    it('links each message to its field, which a screen reader reads after the name of the field', async () => {
      const { t } = renderSignIn();

      await signInWith('', '');
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.accessibilityHint).toBe(
        t('signIn.emailRequired'),
      );
      expect(
        screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.accessibilityHint,
      ).toBeUndefined();

      await signInWith(EMAIL, '');
      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.accessibilityHint).toBe(
        t('signIn.passwordRequired'),
      );
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.accessibilityHint).toBeUndefined();
    });

    it('forgets the message of a field as soon as the user edits one', async () => {
      renderSignIn();
      await signInWith('', '');
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmailError)).toBeTruthy();

      type(AUTH_TEST_IDS.signInEmail, EMAIL);

      expect(screen.queryByTestId(AUTH_TEST_IDS.signInEmailError)).toBeNull();
    });
  });

  describe('a sign-in that the use case refuses', () => {
    it.each([
      [invalidCredentials(), 'errors.invalidCredentials'],
      [networkUnavailable(), 'errors.networkUnavailable'],
      [unexpected(), 'errors.unexpected'],
      [storageWriteFailed(), 'errors.storageWriteFailed'],
    ] as [SignInFailure, 'errors.invalidCredentials'][])(
      'says why, in words of its own, for %p',
      async (failure, key) => {
        const { fakes, t, accessStore } = renderSignIn();
        fakes.auth.signInFailure = failure;

        await signInWith(EMAIL, DEFAULT_PASSWORD);

        const message = screen.getByTestId(AUTH_TEST_IDS.signInError);
        expect(message).toHaveTextContent(t(key));
        expect(message.props.accessibilityRole).toBe('alert');
        expect(accessStore.getState().access).toBe(ACCESS.SignedOut);
      },
    );

    it('says the credentials are wrong when the account does not know them', async () => {
      const { t } = renderSignIn();

      await signInWith(EMAIL, 'not the password');

      expect(screen.getByTestId(AUTH_TEST_IDS.signInError)).toHaveTextContent(
        t('errors.invalidCredentials'),
      );
    });

    it('empties the password and puts the focus back in it, so that the user types it again', async () => {
      renderSignIn();

      await signInWith(EMAIL, 'not the password');

      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.value).toBe('');
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.value).toBe(EMAIL);
      expect(focusRequests()).toEqual([AUTH_TEST_IDS.signInPassword]);
    });

    it('lets the user try again, and signs in when the credentials are right', async () => {
      const { accessStore } = renderSignIn();
      await signInWith(EMAIL, 'not the password');

      await signInWith(EMAIL, DEFAULT_PASSWORD);

      expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
    });

    it('announces the refusal to the screen reader on iOS', async () => {
      jest.replaceProperty(Platform, 'OS', 'ios');
      const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
      announce.mockClear();
      const { t } = renderSignIn();

      await signInWith(EMAIL, 'not the password');

      expect(announce).toHaveBeenCalledWith(t('errors.invalidCredentials'));
    });
  });

  describe('a sign-in that is accepted', () => {
    it('opens the app: the state moves to unlocked and the user is signed in', async () => {
      const { fakes, accessStore } = renderSignIn();

      await signInWith(EMAIL, DEFAULT_PASSWORD);

      expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
      expect(fakes.auth.session?.user.email).toBe(anEmail(EMAIL));
      expect(fakes.appLock.isLocked()).toBe(false);
    });

    it('trims and lowers the email address the way the domain does, and sends the password as typed', async () => {
      const { fakes } = renderSignIn();

      await signInWith('  Alice@Example.com ', DEFAULT_PASSWORD);

      expect(fakes.auth.signInCalls).toEqual([
        { email: anEmail(EMAIL), password: DEFAULT_PASSWORD },
      ]);
    });
  });

  describe('the busy state', () => {
    /** A sign-in that the test settles when it chooses. */
    function holdSignIn(fakes: ReturnType<typeof createFakes>) {
      let resolveSignIn: (result: Result<Session, SignInFailure>) => void = () => undefined;
      let calls = 0;
      fakes.auth.signIn = () => {
        calls += 1;
        return new Promise((resolve) => {
          resolveSignIn = resolve;
        });
      };
      return {
        calls: () => calls,
        release: async (result: Result<Session, SignInFailure>) => {
          await act(async () => {
            resolveSignIn(result);
          });
          await settle();
        },
      };
    }

    it('shows the button busy, with what is going on in its text, and freezes the fields', async () => {
      const fakes = createFakes();
      const held = holdSignIn(fakes);
      const { t } = renderSignIn({ fakes });

      await signInWith(EMAIL, DEFAULT_PASSWORD);

      const button = screen.getByRole('button', { name: t('signIn.submitting') });
      expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.editable).toBe(false);
      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.editable).toBe(false);
      await held.release(err(invalidCredentials()));
      expect(screen.getByRole('button', { name: t('signIn.submit') })).toBeTruthy();
    });

    it('sends one request however many times the button is pressed, and the "go" key as well', async () => {
      const fakes = createFakes();
      const held = holdSignIn(fakes);
      renderSignIn({ fakes });
      type(AUTH_TEST_IDS.signInEmail, EMAIL);
      type(AUTH_TEST_IDS.signInPassword, DEFAULT_PASSWORD);

      await act(async () => {
        submit();
        submit();
        fireEvent(screen.getByTestId(AUTH_TEST_IDS.signInPassword), 'submitEditing');
      });
      await settle();
      submit();

      expect(held.calls()).toBe(1);
      await held.release(err(invalidCredentials()));
    });

    it('does not repeat a failed request by itself: another one needs the user', async () => {
      const { fakes } = renderSignIn();
      fakes.auth.signInFailure = unexpected();

      await signInWith(EMAIL, DEFAULT_PASSWORD);
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(fakes.auth.signInCalls).toHaveLength(1);
    });
  });

  describe('the keyboard', () => {
    it('is put away when the form is sent', async () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      renderSignIn();

      await signInWith(EMAIL, DEFAULT_PASSWORD);

      expect(dismiss).toHaveBeenCalledTimes(1);
    });

    it('stays when the form is refused: the user is sent to the field to correct', async () => {
      const dismiss = jest.spyOn(Keyboard, 'dismiss');
      renderSignIn();

      await signInWith('', '');

      expect(dismiss).not.toHaveBeenCalled();
    });
  });

  describe('the password', () => {
    it('is handed over and emptied when the form is sent, whatever the answer', async () => {
      renderSignIn();
      type(AUTH_TEST_IDS.signInEmail, EMAIL);
      type(AUTH_TEST_IDS.signInPassword, DEFAULT_PASSWORD);
      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.value).toBe(DEFAULT_PASSWORD);

      await act(async () => {
        submit();
      });
      await settle();

      expect(screen.queryByDisplayValue(DEFAULT_PASSWORD)).toBeNull();
    });

    it('is not kept by the query client: no mutation holds it, as its input or in its state', async () => {
      const { queryClient, fakes } = renderSignIn();
      fakes.auth.signInFailure = unexpected();

      await signInWith(EMAIL, DEFAULT_PASSWORD);

      for (const mutation of queryClient.getMutationCache().getAll()) {
        expect(JSON.stringify(mutation.state)).not.toContain(DEFAULT_PASSWORD);
        expect(mutation.state.variables).toBeUndefined();
      }
    });

    it('is not logged, by the console or by the monitoring', async () => {
      const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        jest.spyOn(console, method).mockImplementation(() => undefined),
      );
      const { fakes } = renderSignIn();

      await signInWith(EMAIL, 'not the password');
      await signInWith(EMAIL, DEFAULT_PASSWORD);

      for (const spy of spies) {
        expect(JSON.stringify(spy.mock.calls)).not.toContain(DEFAULT_PASSWORD);
        expect(JSON.stringify(spy.mock.calls)).not.toContain('not the password');
      }
      expect(JSON.stringify([fakes.monitoring.logs, fakes.monitoring.errors])).not.toContain(
        DEFAULT_PASSWORD,
      );
    });
  });

  describe('the notice of a session that ended', () => {
    it.each([
      ['sessionExpired', 'errors.sessionExpired'],
      ['sessionChanged', 'errors.sessionChanged'],
      ['unauthorized', 'errors.unauthorized'],
      ['notAuthenticated', 'errors.notAuthenticated'],
    ] as const)('explains %s, in words, when that is what sent the user here', (code, key) => {
      const { accessStore, t } = renderSignIn({ access: ACCESS.Unlocked });
      act(() => {
        accessStore.getState().endSession(code, epochOf(accessStore));
      });

      expect(screen.getByTestId(AUTH_TEST_IDS.sessionNotice)).toHaveTextContent(t(key));
      expect(screen.getByTestId(AUTH_TEST_IDS.sessionNotice).props.accessibilityRole).toBe('alert');
    });

    it('says nothing when the user signed out themselves', () => {
      renderSignIn();

      expect(screen.queryByTestId(AUTH_TEST_IDS.sessionNotice)).toBeNull();
    });
  });

  describe('the accounts of the demo', () => {
    it('are offered in the mock configuration, and fill in the credentials of the one touched', () => {
      renderSignIn({ demo: true });
      const [first, second] = TEST_DEMO_ACCOUNTS;

      fireEvent.press(screen.getByTestId(demoAccountTestId(second!.email)));

      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.value).toBe(second!.email);
      expect(screen.getByTestId(AUTH_TEST_IDS.signInPassword).props.value).toBe(second!.password);
      fireEvent.press(screen.getByTestId(demoAccountTestId(first!.email)));
      expect(screen.getByTestId(AUTH_TEST_IDS.signInEmail).props.value).toBe(first!.email);
    });

    it('sign the user in through the same use case as a typed form', async () => {
      const { fakes, accessStore } = renderSignIn({ demo: true });
      const [first] = TEST_DEMO_ACCOUNTS;
      fakes.auth.registerAccount(anEmail(first!.email), first!.password, aSession());

      fireEvent.press(screen.getByTestId(demoAccountTestId(first!.email)));
      await act(async () => {
        submit();
      });
      await settle();

      expect(accessStore.getState().access).toBe(ACCESS.Unlocked);
    });

    it('are marked as the demo, with a header and an explanation', () => {
      const { t } = renderSignIn({ demo: true });

      const panel = screen.getByTestId(CORE_TEST_IDS.demoAccounts);

      expect(within(panel).getByText(t('demo.badge'))).toBeTruthy();
      expect(within(panel).getByRole('header', { name: t('demo.accounts') })).toBeTruthy();
      expect(within(panel).getByText(t('demo.accountsHint'))).toBeTruthy();
    });

    it('are absent when the services have no demo controls: every configuration but the mock one', () => {
      renderSignIn();

      expect(screen.queryByTestId(CORE_TEST_IDS.demoAccounts)).toBeNull();
    });
  });

  describe('a device that is offline', () => {
    it('says so at the top, and nothing when the connection is there', () => {
      const { t, uiStore } = renderSignIn();
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

    it('shows nothing else of the banner: there is no data and no synchronisation to tell here', () => {
      const { uiStore } = renderSignIn({
        notices: { localDataReset: true, acknowledgeLocalDataReset: jest.fn() },
      });
      act(() => {
        uiStore.getState().setConnectivity(CONNECTIVITY_STATUS.Offline);
      });

      expect(screen.queryByTestId(CORE_TEST_IDS.localDataResetNotice)).toBeNull();
      expect(screen.queryByTestId(VOTES_TEST_IDS.syncSummary)).toBeNull();
    });

    it('offers the switch of the demo, in the mock configuration only', () => {
      renderSignIn({ demo: true });
      expect(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch)).toBeTruthy();
    });

    it('has no switch in any other configuration', () => {
      renderSignIn();
      expect(screen.queryByTestId(CORE_TEST_IDS.demoOfflineSwitch)).toBeNull();
    });

    it('can be brought back online with the switch, which is reachable with the form', async () => {
      const { demoNetwork } = renderSignIn({ demo: true });

      await act(async () => {
        fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));
      });
      expect(demoNetwork?.online).toBe(false);
      await act(async () => {
        fireEvent.press(screen.getByTestId(CORE_TEST_IDS.demoOfflineSwitch));
      });

      expect(demoNetwork?.online).toBe(true);
    });
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)(
      'is written in %s, errors and notice included',
      async (language) => {
        const { t, accessStore } = renderSignIn({ language, access: ACCESS.Unlocked, demo: true });
        act(() => {
          accessStore.getState().endSession(sessionExpired().code, epochOf(accessStore));
        });

        await signInWith('nope', 'secret');

        expect(screen.getByRole('header', { name: t('signIn.title') })).toBeTruthy();
        expect(screen.getByText(t('signIn.message'))).toBeTruthy();
        expect(screen.getByLabelText(t('signIn.email'))).toBeTruthy();
        expect(screen.getByText(t('signIn.emailInvalid'))).toBeTruthy();
        expect(screen.getByTestId(AUTH_TEST_IDS.sessionNotice)).toHaveTextContent(
          t('errors.sessionExpired'),
        );
        expect(screen.getByText(t('demo.accountsHint'))).toBeTruthy();
      },
    );

    it('says the credentials are wrong in French', async () => {
      renderSignIn({ language: 'fr' });

      await signInWith(EMAIL, 'not the password');

      expect(screen.getByTestId(AUTH_TEST_IDS.signInError)).toHaveTextContent(
        'L’adresse e-mail ou le mot de passe est incorrect.',
      );
      expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
    });
  });
});
