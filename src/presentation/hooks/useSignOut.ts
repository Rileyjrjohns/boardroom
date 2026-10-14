import type { StorageWriteFailedError } from '@domain/errors/StorageError';

import { useResultMutation } from '../query/useResultMutation';
import { useAppServices } from '../services/AppServices';
import { useUiStore } from '../state/uiStore';

/**
 * Signs the user out: the use case empties the caches and forgets the session, and the state moves
 * to `SignedOut`, which empties what the interface holds and sends the user to the sign-in screen
 * (see `createAppState`). The votes waiting in the outbox are kept by the use case. A session that
 * cannot be forgotten is the one failure, and the confirmation says so and can be confirmed again.
 * The use case has already locked the app by then, so the next request of the screen the user is
 * on sends them to the lock screen, where signing out is offered as well.
 */
export function useSignOut() {
  const { useCases } = useAppServices();
  const signedOut = useUiStore((state) => state.signedOut);

  return useResultMutation<void, void, StorageWriteFailedError>({
    execute: () => useCases.signOut.execute(),
    onSuccess: signedOut,
  });
}
