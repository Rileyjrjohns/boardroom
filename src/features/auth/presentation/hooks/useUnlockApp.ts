import { useAppServices } from '@composition/shell/services/AppServices';
import { useUiStore } from '@composition/shell/state/uiStore';
import type { BiometricError } from '@core/domain/errors/BiometricError';
import { useResultMutation } from '@core/presentation/query/useResultMutation';

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
