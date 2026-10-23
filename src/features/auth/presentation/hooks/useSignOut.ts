import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import { useResultMutation } from '@core/presentation/query/useResultMutation';

import { useAuthServices } from '../services/AuthServices';
import { useAccessStore, useAccessStoreApi } from '../state/accessStore';

/**
 * Signs the user out: the use case empties the caches and forgets the session, and the state moves
 * to `SignedOut`, which empties what the interface holds and sends the user to the sign-in screen
 * (see `createAppState`). The votes waiting in the outbox are kept by the use case. A session that
 * cannot be forgotten is the one failure, and the confirmation says so and can be confirmed again.
 * The use case has already locked the app by then (and emptied the caches), so the interface
 * follows it to the lock screen straight away instead of leaving the screen of the user on display
 * with nothing behind it; signing out is offered there as well.
 */
export function useSignOut() {
  const { signOut } = useAuthServices();
  const store = useAccessStoreApi();
  const signedOut = useAccessStore((state) => state.signedOut);

  return useResultMutation<void, void, StorageWriteFailedError>({
    execute: () => signOut.execute(),
    onSuccess: signedOut,
    onFailure: (_failure, _input, startedUnder) => {
      store.getState().locked(startedUnder);
    },
  });
}
