import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { APP_STATE } from '../session/appState';

// Test support, not production code: only tests import it (a lint rule enforces it).

/**
 * The `AppState` of React Native in Jest is a stand-in that listens to nothing. This takes its
 * place for a test: it records the listeners the code under test registers, and `emit` tells them
 * that the app moved to another state, the way the system does. It must be called before the code
 * that registers (the render), and restored by `jest.restoreAllMocks()`.
 */
export function driveAppState(initial: AppStateStatus = APP_STATE.Active) {
  Object.assign(AppState, { currentState: initial });
  const listeners = new Set<(state: AppStateStatus) => void>();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    listeners.add(listener);
    return {
      remove: () => {
        listeners.delete(listener);
      },
    };
  });

  return {
    /** The app moves to another state. */
    emit(state: AppStateStatus): void {
      Object.assign(AppState, { currentState: state });
      for (const listener of [...listeners]) listener(state);
    },
    get listenerCount(): number {
      return listeners.size;
    },
  };
}
