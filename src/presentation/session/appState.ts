import type { AppStateStatus } from 'react-native';

/**
 * The states of React Native's `AppState` that the layer reads, named once (the type of the
 * system's own values says which exist, so a misspelled one does not compile).
 */
export const APP_STATE = {
  Active: 'active',
  Inactive: 'inactive',
  Background: 'background',
} as const satisfies Record<string, AppStateStatus>;

/** The states in which the system may take a snapshot of the app, or show it to nobody. */
export function isHidden(state: AppStateStatus): boolean {
  return state === APP_STATE.Inactive || state === APP_STATE.Background;
}
