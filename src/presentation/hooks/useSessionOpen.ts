import { ACCESS, useUiStore } from '../state/uiStore';

/**
 * Whether the app is open: signed in and unlocked. The queries that hold the data of a user run
 * only then (`enabled`). The screens that show such data are removed from the stack when the user
 * leaves the open app, and the cache is emptied; this is what makes sure that nothing in between
 * asks again on the empty cache: a query that is built again for a screen still mounted for one
 * more render waits instead of asking a use case that would only answer that the session is over.
 */
export function useSessionOpen(): boolean {
  return useUiStore((state) => state.access === ACCESS.Unlocked);
}
