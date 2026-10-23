import { useAppServices } from '@composition/shell/services/AppServices';
import { useUiStore, useUiStoreApi } from '@composition/shell/state/uiStore';
import type { StorageWriteFailedError } from '@core/domain/errors/StorageError';
import { useResultMutation } from '@core/presentation/query/useResultMutation';

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
  const { useCases } = useAppServices();
  const store = useUiStoreApi();
  const signedOut = useUiStore((state) => state.signedOut);

  return useResultMutation<void, void, StorageWriteFailedError>({
    execute: () => useCases.signOut.execute(),
    onSuccess: signedOut,
    onFailure: (_failure, _input, startedUnder) => {
      store.getState().locked(startedUnder);
    },
  });
}
