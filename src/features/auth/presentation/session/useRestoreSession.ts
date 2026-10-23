import { useCallback, useEffect, useState } from 'react';

import { useAppServices } from '@composition/shell/services/AppServices';
import { ACCESS, useUiStore } from '@composition/shell/state/uiStore';
import type { StorageReadFailedError } from '@core/domain/errors/StorageError';

export interface RestoreSessionState {
  /** Why `RestoreSession` could not find out whether somebody is signed in. */
  readonly failure: StorageReadFailedError | undefined;
  /** Asks again after a failure. */
  retry(): void;
}

/**
 * The cold start of the session: asks `RestoreSession` who was signed in when the app was last
 * used, once, as soon as the app has started. No session sends the user to the sign-in screen; a
 * restored one to the lock screen, always (the use case locks the app, and the state follows its
 * answer). The only failure is a stored session that cannot be read, which can be asked again.
 */
export function useRestoreSession(): RestoreSessionState {
  const { useCases } = useAppServices();
  const starting = useUiStore((state) => state.access === ACCESS.Starting);
  const sessionRestored = useUiStore((state) => state.sessionRestored);
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState<StorageReadFailedError>();

  useEffect(() => {
    if (!starting) return;
    let current = true;
    void useCases.restoreSession.execute().then((result) => {
      if (!current) return;
      if (result.ok) {
        setFailure(undefined);
        sessionRestored(result.value.status);
      } else {
        setFailure(result.error);
      }
    });
    return () => {
      current = false;
    };
  }, [starting, attempt, useCases, sessionRestored]);

  const retry = useCallback(() => {
    setFailure(undefined);
    setAttempt((count) => count + 1);
  }, []);

  return { failure, retry };
}
