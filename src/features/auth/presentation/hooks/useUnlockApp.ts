import { useResultMutation } from '@core/presentation/query/useResultMutation';
import type { BiometricError } from '@features/auth/domain/errors/BiometricError';

import { useAuthServices } from '../services/AuthServices';
import { useAccessStore } from '../state/accessStore';

/**
 * Unlocks the app with the biometric prompt of the device. On success the state moves to
 * `Unlocked`; every outcome of the prompt is an error of `UnlockApp` with a message of its own.
 */
export function useUnlockApp() {
  const { unlockApp } = useAuthServices();
  const unlocked = useAccessStore((state) => state.unlocked);

  return useResultMutation<void, void, BiometricError>({
    execute: () => unlockApp.execute(),
    onSuccess: unlocked,
  });
}
