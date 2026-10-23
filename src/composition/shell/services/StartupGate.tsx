import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { err } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { LoadingState } from '@core/presentation/components/LoadingState';
import { BIOMETRIC_PROMPT_KEYS } from '@core/presentation/i18n/translationKeys';
import { TEST_IDS } from '@core/presentation/testIds';
import type { BiometricReason } from '@features/auth/application/ports/BiometricGate';

import { StartupFailureScreen } from '../screens/StartupFailureScreen';

import { AppProviders } from './AppProviders';
import type { AppServices } from './AppServices';

/** What the system prompt says: its message and the label of its cancel button. */
export interface BiometricPrompt {
  readonly message: string;
  readonly cancelLabel: string;
}

/** The text of the system prompt for a reason, in the language of the user at the time it is asked. */
export type BiometricPromptText = (reason: BiometricReason) => BiometricPrompt;

/** What the code of a start that rejects instead of answering is: a bug, but a screen all the same. */
export const STARTUP_ABORTED = 'startupAborted';

/** What the app does to start, which is asynchronous and can fail with a code. */
export type StartApp = (
  biometricPromptText: BiometricPromptText,
) => Promise<Result<AppServices, { readonly code: string }>>;

interface StartupGateProps {
  /** Builds what the screens need. Called once, when the gate first mounts. */
  readonly start: StartApp;
  /** The screens, shown inside the providers once the app has started. */
  readonly children: ReactNode;
}

/**
 * The start of the app, as the user sees it: a translated loading state while the composition root
 * is built (it opens the local database), then the screens inside `AppProviders`, or the screen
 * that says why the app cannot start. It hands the start the means to read the system prompt text
 * from the translations of the moment: the function reads the current language each time it is
 * called, so a language changed while the app runs is followed by the next prompt.
 */
export function StartupGate({ start, children }: StartupGateProps) {
  const { t, i18n } = useTranslation();
  // The start is a promise held in a ref and begun in the effect, once: a dev-only double run of
  // the effects (StrictMode) finds it there and does not open the database a second time.
  const starting = useRef<ReturnType<StartApp>>(undefined);
  const [started, setStarted] = useState<Awaited<ReturnType<StartApp>>>();

  useEffect(() => {
    starting.current ??= start((reason) => ({
      message: i18n.t(BIOMETRIC_PROMPT_KEYS[reason]),
      cancelLabel: i18n.t('common.cancel'),
    }));
    let current = true;
    starting.current
      .catch(() => err({ code: STARTUP_ABORTED }))
      .then((outcome) => {
        if (current) setStarted(outcome);
      });
    return () => {
      current = false;
    };
  }, [start, i18n]);

  if (started === undefined) {
    return (
      <LoadingState accessibilityLabel={t('startup.loading')} testID={TEST_IDS.startupLoading} />
    );
  }
  return started.ok ? (
    <AppProviders services={started.value}>{children}</AppProviders>
  ) : (
    <StartupFailureScreen code={started.error.code} />
  );
}
