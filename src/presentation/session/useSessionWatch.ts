import { useEffect, useRef } from 'react';

import { ACCESS, useUiStore, useUiStoreApi } from '../state/uiStore';

import { useSessionCheck } from './useSessionCheck';

/**
 * How often an app that stays open and in the foreground asks whether its session is still good,
 * in milliseconds. A session that expires while the user looks at the screen must not leave the
 * data on it until the next request happens to find out: the longest it can stay is this, plus the
 * time of a check. The check is local (the session guard reads the stored session and the clock),
 * so a short period costs nothing; it is long enough not to be a loop.
 */
export const SESSION_CHECK_INTERVAL_MILLIS = 30_000;

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
