import { useEffect, useRef } from 'react';

import { ACCESS, useUiStore, useUiStoreApi } from '@composition/shell/state/uiStore';
import { SESSION_CHECK_INTERVAL_MILLIS } from '@features/auth/application/session/sessionPolicy';

import { useSessionCheck } from './useSessionCheck';

/**
 * Checks the session on a timer (`SESSION_CHECK_INTERVAL_MILLIS`), while the app is open and in the
 * foreground (the privacy cover is down), through the same check as the return from the
 * background (`useSessionCheck`). The timer exists only then: it is cleared when the user leaves the
 * open app and when the app goes away (the return from the background checks, and a timer that
 * runs on in the background wakes the device for nothing), and when the screen is unmounted. A
 * check that is still under way when the next tick comes is not doubled.
 */
export function useSessionWatch(): void {
  const check = useSessionCheck();
  const store = useUiStoreApi();
  const open = useUiStore((state) => state.access === ACCESS.Unlocked);
  const covered = useUiStore((state) => state.privacyCover);
  const checking = useRef(false);

  useEffect(() => {
    if (!open || covered) return;
    const timer = setInterval(() => {
      if (checking.current) return;
      checking.current = true;
      void check(store.getState().accessEpoch).finally(() => {
        checking.current = false;
      });
    }, SESSION_CHECK_INTERVAL_MILLIS);
    return () => {
      clearInterval(timer);
    };
  }, [open, covered, check, store]);
}
