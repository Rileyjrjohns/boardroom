import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';

import { ErrorState } from '../components/ErrorState';
import { LoadingState } from '../components/LoadingState';
import { PrivacyCover } from '../components/PrivacyCover';
import { useAppServices } from '../services/AppServices';
import { ACCESS, useUiStore } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { colors } from '../theme/tokens';

import { useAppLifecycle } from './useAppLifecycle';
import { useConnectivityStatus } from './useConnectivityStatus';
import { useRestoreSession } from './useRestoreSession';
import { useVoteSync } from './useVoteSync';

interface SessionControllerProps {
  /** The navigator: what the user sees once the session is known. */
  readonly children: ReactNode;
}

/**
 * Everything that follows the session and the life of the app, mounted once above the navigator:
 *
 * - at the start, `RestoreSession` is asked who was signed in, and until it answers the user sees
 *   the loading state (and its failure, with a way to ask again);
 * - the connection of the device is followed, for the banner and for the synchronisation;
 * - the app going to the background and coming back is followed: the privacy cover, and the lock
 *   evaluated before anything is shown;
 * - the votes that wait are sent when the connection comes back, when the app returns to the
 *   foreground and when the user signs in or unlocks;
 * - a session that ended in use (not by the user's own sign-out) is also ended on the device, so
 *   that a restart does not find a session the server has refused.
 *
 * The screens the user can reach follow the state of access, in the navigator.
 */
export function SessionController({ children }: SessionControllerProps) {
  const { t } = useTranslation();
  const access = useUiStore((state) => state.access);
  const covered = useUiStore((state) => state.privacyCover);
  const restore = useRestoreSession();
  const requestSync = useVoteSync();
  useConnectivityStatus(requestSync);
  useAppLifecycle(requestSync);
  useSignOutEndedSession();

  // After a sign-in or an unlock, what waits is sent. A start that is already open (a test, a
  // session opened by the configuration) does the same.
  useEffect(() => {
    if (access === ACCESS.Unlocked) requestSync();
  }, [access, requestSync]);

  let content: ReactNode = children;
  if (access === ACCESS.Starting) {
    content =
      restore.failure === undefined ? (
        <LoadingState accessibilityLabel={t('startup.loading')} testID={TEST_IDS.startupLoading} />
      ) : (
        <View style={styles.screen}>
          <ErrorState
            code={restore.failure.code}
            onRetry={restore.retry}
            testID={TEST_IDS.restoreError}
          />
        </View>
      );
  }

  return (
    <>
      {content}
      {covered ? <PrivacyCover /> : null}
    </>
  );
}

/**
 * Forgets on the device a session that a failure ended: the server refused it (`unauthorized`), it
 * expired, nobody was signed in, another user was. The app was sent to the sign-in screen, and a
 * restart must not restore what the server no longer accepts. `SignOut` does it, and it succeeds
 * when nobody is signed in. A lock is not the end of a session: the user unlocks it.
 */
function useSignOutEndedSession(): void {
  const { useCases } = useAppServices();
  const endedBy = useUiStore((state) => state.sessionEndedBy);

  useEffect(() => {
    if (endedBy === undefined || endedBy === AUTHENTICATION_ERROR_CODE.AppLocked) return;
    void useCases.signOut.execute();
  }, [endedBy, useCases]);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
