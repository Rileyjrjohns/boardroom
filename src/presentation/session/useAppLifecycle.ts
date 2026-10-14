import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import type { Instant } from '@domain/value-objects/Instant';

import { useAppServices } from '../services/AppServices';
import { ACCESS, useUiStoreApi } from '../state/uiStore';

/** The states in which the system may take a snapshot of the app, or show it to nobody. */
function isHidden(state: AppStateStatus): boolean {
  return state === 'inactive' || state === 'background';
}

/**
 * What the app does as it goes to the background and comes back, from the events of React Native's
 * own `AppState`:
 *
 * - **The privacy cover.** The content is covered as soon as the app is no longer active (the app
 *   switcher takes its snapshot as the app goes inactive, and nothing confidential must be in it),
 *   and uncovered only when it is active again and, if it had been in the background, the lock has
 *   been evaluated. This is the JavaScript-level fallback; the native screen protection of the
 *   document viewer step replaces it on iOS.
 * - **The lock.** The instant the app went to the background is recorded from the clock of the use
 *   cases (not when it merely became inactive: the system's biometric prompt makes it inactive,
 *   and unlocking must not count as having been away). On the way back, `EvaluateAppLock` judges
 *   it against the grace period, before the content is shown: when the unlock is required, or the
 *   answer cannot be known, the state moves to `Locked`, which empties the cache and removes the
 *   screens. Failing to judge fails closed.
 * - **The synchronisation.** Once the lock has been judged and the app is still open, `onResumed`
 *   asks for the votes that wait to be sent.
 *
 * A return from inactive that never went to the background (the prompt closing, a pulled-down
 * control centre) only uncovers the content.
 */
export function useAppLifecycle(onResumed: () => void): void {
  const { useCases, clock } = useAppServices();
  const store = useUiStoreApi();
  const latestOnResumed = useRef(onResumed);

  useEffect(() => {
    latestOnResumed.current = onResumed;
  });

  useEffect(() => {
    let current: AppStateStatus = AppState.currentState;
    let backgroundedAt: Instant | undefined;
    store.getState().setPrivacyCover(isHidden(current));

    const resume = async (since: Instant): Promise<void> => {
      if (store.getState().access === ACCESS.Unlocked) {
        const required = await useCases.evaluateAppLock.execute({ backgroundedAt: since });
        if (!required.ok || required.value) store.getState().locked();
      }
      // The app may have gone away again while the lock was being judged: it stays covered then.
      if (!isHidden(current)) store.getState().setPrivacyCover(false);
      if (!isHidden(current) && store.getState().access === ACCESS.Unlocked) {
        latestOnResumed.current();
      }
    };

    const subscription = AppState.addEventListener('change', (next) => {
      current = next;
      if (isHidden(next)) {
        store.getState().setPrivacyCover(true);
        if (next === 'background' && backgroundedAt === undefined) backgroundedAt = clock.now();
        return;
      }
      const since = backgroundedAt;
      backgroundedAt = undefined;
      if (since === undefined) {
        store.getState().setPrivacyCover(false);
        return;
      }
      void resume(since);
    });
    return () => {
      subscription.remove();
    };
  }, [store, useCases, clock]);
}
