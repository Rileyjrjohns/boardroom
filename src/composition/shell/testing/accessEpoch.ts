import type { AccessStore } from '@features/auth/presentation/state/accessStore';

// Test support, not production code: only tests import it (a lint rule enforces it).

/**
 * The epoch of the access as a check that starts now would read it: what a test hands back to the
 * store with a result that started under the access the store is in.
 */
export function epochOf(store: AccessStore): number {
  return store.getState().accessEpoch;
}
