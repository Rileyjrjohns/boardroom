import { useQuery } from '@tanstack/react-query';

import { unwrapResult } from '@core/presentation/query/QueryFailure';
import type { User } from '@features/auth/domain/entities/User';

import { sessionQueryKeys } from '../query/sessionQueryKeys';
import { useAuthServices } from '../services/AuthServices';
import { useSessionOpen } from '../state/useSessionOpen';

/**
 * Who is signed in. The screens that apply a rule to the user (may they vote?) need their identity,
 * which no screen has before the unlock: it comes from the `GetCurrentUser` use case, through the
 * session guard, and is dropped from the cache with everything else when the session ends.
 */
export function useCurrentUser() {
  const { getCurrentUser } = useAuthServices();
  const open = useSessionOpen();

  return useQuery<User, Error>({
    queryKey: sessionQueryKeys.user(),
    queryFn: async () => unwrapResult(await getCurrentUser.execute()),
    enabled: open,
  });
}
