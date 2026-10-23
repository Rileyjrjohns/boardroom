import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { ROUTES } from '@core/presentation/navigation/routes';

/** Opens the screen of the votes that wait to be sent. The callback is stable. */
export function useOpenPendingVotes(): () => void {
  const router = useRouter();

  return useCallback(() => {
    router.push(ROUTES.pendingVotes);
  }, [router]);
}
