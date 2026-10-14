import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';

import { DialogHost } from '../components/DialogHost';
import { LoadingState } from '../components/LoadingState';
import { PrivacyCover } from '../components/PrivacyCover';
import { RestoreFailure } from '../components/RestoreFailure';
import { useAppServices } from '../services/AppServices';
import { ACCESS, useUiStore } from '../state/uiStore';
import { TEST_IDS } from '../testIds';

import { useAppLifecycle } from './useAppLifecycle';
import { useConnectivityStatus } from './useConnectivityStatus';
import { useRestoreSession } from './useRestoreSession';
import { useSessionWatch } from './useSessionWatch';
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
 *   and the session evaluated before anything is shown;
 * - an app that stays open is asked, on a timer, whether its session is still good;
 * - while the privacy cover or a dialog is over the content, the content is out of reach of the
 *   screen reader (`DialogHost`);
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
  useSessionWatch();
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
        <RestoreFailure code={restore.failure.code} onRetry={restore.retry} />
      );
  }

  return (
    <>
      <DialogHost covered={covered}>{content}</DialogHost>
      {covered ? <PrivacyCover /> : null}
    </>
  );
}

/**
 * Forgets on the device a session that a failure ended: it expired, nobody was signed in, another
 * user was. The app was sent to the sign-in screen, and a restart must not restore what is no
 * longer valid. `SignOut` does it, and it succeeds when nobody is signed in.
 *
 * Two codes are left out. A lock is not the end of a session: the user unlocks it. And
 * `unauthorized`, the server refusing the session, was already ended by the application layer
 * where it met the answer (`endRefusedSession`): signing out again would be a second sign-out for
 * one failure, and could sign out a user who signed in after the first.
 */
function useSignOutEndedSession(): void {
  const { useCases } = useAppServices();
  const endedBy = useUiStore((state) => state.sessionEndedBy);

  useEffect(() => {
    if (endedBy === undefined || !FORGOTTEN_HERE.has(endedBy)) return;
    void useCases.signOut.execute();
  }, [endedBy, useCases]);
}

/** The failures whose session this component forgets: the application layer ended the others. */
const FORGOTTEN_HERE: ReadonlySet<string> = new Set<string>([
  AUTHENTICATION_ERROR_CODE.NotAuthenticated,
  AUTHENTICATION_ERROR_CODE.SessionExpired,
  AUTHENTICATION_ERROR_CODE.SessionChanged,
]);
