import { act, render, screen } from '@testing-library/react-native';
import { StrictMode } from 'react';
import { Text } from 'react-native';

import { BIOMETRIC_REASON } from '@application/ports/BiometricGate';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { I18nProvider } from '../i18n/I18nProvider';
import { TEST_IDS } from '../testIds';
import { unusedServices } from '../testing/unusedServices';

import { useAppServices } from './AppServices';
import type { AppServices } from './AppServices';
import { STARTUP_ABORTED, StartupGate } from './StartupGate';
import type { BiometricPromptText, StartApp } from './StartupGate';

const SERVICES: AppServices = unusedServices(12);

type Outcome = Result<AppServices, { readonly code: string }>;

/** A start that settles when the test says so. */
function deferredStart() {
  let settle: (outcome: Outcome) => void = () => undefined;
  let fail: (reason: unknown) => void = () => undefined;
  const promptTexts: BiometricPromptText[] = [];
  const start: StartApp = jest.fn((biometricPromptText: BiometricPromptText) => {
    promptTexts.push(biometricPromptText);
    return new Promise<Outcome>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
  });
  return {
    start,
    promptTexts,
    resolve: (outcome: Outcome) => act(async () => settle(outcome)),
    reject: (reason: unknown) => act(async () => fail(reason)),
  };
}

function PageSize() {
  const text = `page size ${useAppServices().settings.meetingsPageSize}`;
  return <Text>{text}</Text>;
}

describe('StartupGate', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'shows a translated loading state while the app starts, in %s',
    (language) => {
      const { start } = deferredStart();
      const { t } = createI18n(language);

      render(
        <I18nProvider language={language}>
          <StartupGate start={start}>
            <PageSize />
          </StartupGate>
        </I18nProvider>,
      );

      expect(screen.getByTestId(TEST_IDS.startupLoading)).toBeTruthy();
      expect(screen.getByRole('progressbar', { name: t('startup.loading') })).toBeTruthy();
      expect(screen.queryByText(/page size/)).toBeNull();
    },
  );

  it('shows the screens inside the providers once the app has started', async () => {
    const { start, resolve } = deferredStart();
    render(
      <I18nProvider language="en">
        <StartupGate start={start}>
          <PageSize />
        </StartupGate>
      </I18nProvider>,
    );

    await resolve(ok(SERVICES));

    expect(screen.getByText('page size 12')).toBeTruthy();
    expect(screen.queryByTestId(TEST_IDS.startupLoading)).toBeNull();
  });

  it('shows why the app cannot start, with the technical code, when the start fails', async () => {
    const { start, resolve } = deferredStart();
    const { t } = createI18n('en');
    render(
      <I18nProvider language="en">
        <StartupGate start={start}>
          <PageSize />
        </StartupGate>
      </I18nProvider>,
    );

    await resolve(err({ code: 'storageUnavailable' }));

    expect(screen.getByTestId(TEST_IDS.startupFailure)).toBeTruthy();
    expect(screen.getByText(t('startup.code', { code: 'storageUnavailable' }))).toBeTruthy();
    expect(screen.queryByText(/page size/)).toBeNull();
  });

  it('shows a failure of its own, instead of crashing, when the start rejects', async () => {
    const { start, reject } = deferredStart();
    const { t } = createI18n('en');
    render(
      <I18nProvider language="en">
        <StartupGate start={start}>
          <PageSize />
        </StartupGate>
      </I18nProvider>,
    );

    await reject(new Error('a bug'));

    expect(screen.getByText(t('startup.code', { code: STARTUP_ABORTED }))).toBeTruthy();
  });

  it('starts the app once, whatever the number of renders', async () => {
    const { start, resolve } = deferredStart();
    const tree = (
      <I18nProvider language="en">
        <StartupGate start={start}>
          <PageSize />
        </StartupGate>
      </I18nProvider>
    );
    const { rerender } = render(tree);

    rerender(tree);
    await resolve(ok(SERVICES));
    rerender(tree);

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts the app once even when the effects run twice, as they do in development under StrictMode', async () => {
    const { start, resolve } = deferredStart();
    render(
      <StrictMode>
        <I18nProvider language="en">
          <StartupGate start={start}>
            <PageSize />
          </StartupGate>
        </I18nProvider>
      </StrictMode>,
    );

    await resolve(ok(SERVICES));

    expect(start).toHaveBeenCalledTimes(1);
    expect(screen.getByText('page size 12')).toBeTruthy();
  });

  it('does not touch the screen once it has been left before the app started', async () => {
    const { start, resolve } = deferredStart();
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = render(
      <I18nProvider language="en">
        <StartupGate start={start}>
          <PageSize />
        </StartupGate>
      </I18nProvider>,
    );

    unmount();
    await resolve(ok(SERVICES));

    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  describe('the text of the biometric prompt it hands to the start', () => {
    it.each([
      ['en', BIOMETRIC_REASON.UnlockApp, 'Unlock Boardroom', 'Cancel'],
      ['en', BIOMETRIC_REASON.ConfirmVote, 'Confirm your vote', 'Cancel'],
      ['fr', BIOMETRIC_REASON.UnlockApp, 'Déverrouiller Boardroom', 'Annuler'],
      ['fr', BIOMETRIC_REASON.ConfirmVote, 'Confirmer votre vote', 'Annuler'],
    ] as const)(
      'is the translation of the reason and of the cancel button, in %s: %s',
      (language, reason, text, cancelLabel) => {
        const { start, promptTexts } = deferredStart();
        render(
          <I18nProvider language={language}>
            <StartupGate start={start}>
              <PageSize />
            </StartupGate>
          </I18nProvider>,
        );

        expect(promptTexts[0]?.(reason)).toEqual({ message: text, cancelLabel });
      },
    );

    it('follows the language of the moment it is called, not the one the app started in', () => {
      const { start, promptTexts } = deferredStart();
      const tree = (language: 'en' | 'fr') => (
        <I18nProvider language={language}>
          <StartupGate start={start}>
            <PageSize />
          </StartupGate>
        </I18nProvider>
      );
      const { rerender } = render(tree('en'));
      const promptText = promptTexts[0];
      expect(promptText?.(BIOMETRIC_REASON.ConfirmVote)).toEqual({
        message: 'Confirm your vote',
        cancelLabel: 'Cancel',
      });

      rerender(tree('fr'));

      expect(promptText?.(BIOMETRIC_REASON.ConfirmVote)).toEqual({
        message: 'Confirmer votre vote',
        cancelLabel: 'Annuler',
      });
    });
  });
});
