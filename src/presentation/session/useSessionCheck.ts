import { useCallback } from 'react';

import { isSessionEndingCode } from '../query/createQueryClient';
import { useAppServices } from '../services/AppServices';
import { ACCESS, useUiStoreApi } from '../state/uiStore';

/**
 * Asks whether the session of the open app is still good, and ends it if it is not. It returns
 * `check(epoch)`, where `epoch` is the access the caller is checking (the epoch of the store when it
 * decided to check).
 *
 * The question goes to a use case (`GetCurrentUser`, through the session guard), which is what
 * knows the session: an expired one is found out and the caches are emptied by the guard, and
 * the screen is sent to the sign-in screen with the reason (`sessionExpired`, `notAuthenticated`,
 * `unauthorized`...), or to the lock screen if the app is locked. A question that cannot be
 * answered (the stored session cannot be read) fails closed, with the lock screen: nothing says
 * the content may stay. The answer is applied only if the access is still the one `epoch` names, so
 * a check that outlives its user does not touch the next one.
 *
 * Two things ask: the return from the background when no lock is required (`useAppLifecycle`),
 * which keeps the privacy cover up until the answer, and the timer of an app that stays open
 * (`useSessionWatch`).
 */
export function useSessionCheck(): (epoch: number) => Promise<void> {
  const { useCases } = useAppServices();
  const store = useUiStoreApi();

  return useCallback(
    async (epoch) => {
      if (store.getState().access !== ACCESS.Unlocked) return;
      const checked = await useCases.getCurrentUser.execute();
      if (checked.ok) return;

      const { code } = checked.error;
      if (isSessionEndingCode(code)) {
        store.getState().endSession(code, epoch);
      } else {
        store.getState().locked(epoch);
      }
    },
    [useCases, store],
  );
}
