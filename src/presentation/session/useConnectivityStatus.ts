import { useEffect, useRef } from 'react';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';

import { useAppServices } from '../services/AppServices';
import { useUiStore } from '../state/uiStore';

/**
 * Follows the connection of the device through the `ObserveConnectivity` use case, from the start
 * of the app (it needs no session) and until the app is gone: the status goes to the interface
 * store, where the offline line of the banner reads it (on the screens of the open app, and on the
 * sign-in and lock screens), and `onOnline` is called each time the
 * connection comes back, which is when the votes that wait are sent. The device saying it is
 * online is a hint, not a promise: the synchronisation is what finds out.
 */
export function useConnectivityStatus(onOnline: () => void): void {
  const { useCases } = useAppServices();
  const setConnectivity = useUiStore((state) => state.setConnectivity);
  const latestOnOnline = useRef(onOnline);

  useEffect(() => {
    latestOnOnline.current = onOnline;
  });

  useEffect(() => {
    let active = true;
    let stop: (() => void) | undefined;

    void useCases.observeConnectivity
      .execute((status) => {
        setConnectivity(status);
        if (status === CONNECTIVITY_STATUS.Online) latestOnOnline.current();
      })
      .then((observation) => {
        if (!active) {
          observation.unsubscribe();
          return;
        }
        stop = observation.unsubscribe;
        setConnectivity(observation.status);
      });

    return () => {
      active = false;
      stop?.();
    };
  }, [useCases, setConnectivity]);
}
