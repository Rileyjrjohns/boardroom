import type { BiometricError } from '@domain/errors/BiometricError';

import { useResultMutation } from '../query/useResultMutation';
import { useAppServices } from '../services/AppServices';
import { useUiStore } from '../state/uiStore';

/**
 * Unlocks the app with the biometric prompt of the device. On success the state moves to
 * `Unlocked`; every outcome of the prompt is an error of `UnlockApp` with a message of its own.
 */
export function useUnlockApp() {
  const { useCases } = useAppServices();
  const unlocked = useUiStore((state) => state.unlocked);

  return useResultMutation<void, void, BiometricError>({
    execute: () => useCases.unlockApp.execute(),
    onSuccess: unlocked,
  });
}
