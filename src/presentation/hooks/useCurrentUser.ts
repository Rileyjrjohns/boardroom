import { useQuery } from '@tanstack/react-query';

import type { User } from '@domain/entities/User';

import { queryKeys } from '../query/queryKeys';
import { unwrapResult } from '../query/QueryFailure';
import { useAppServices } from '../services/AppServices';

import { useSessionOpen } from './useSessionOpen';

/**
 * Who is signed in. The screens that apply a rule to the user (may they vote?) need their identity,
 * which no screen has before the unlock: it comes from the `GetCurrentUser` use case, through the
 * session guard, and is dropped from the cache with everything else when the session ends.
 */
export function useCurrentUser() {
  const { useCases } = useAppServices();
  const open = useSessionOpen();

  return useQuery<User, Error>({
    queryKey: queryKeys.session.user(),
    queryFn: async () => unwrapResult(await useCases.getCurrentUser.execute()),
    enabled: open,
  });
}
