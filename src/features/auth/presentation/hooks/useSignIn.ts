import { useCallback, useRef } from 'react';

import { unexpected } from '@core/domain/errors/RepositoryError';
import { err, map } from '@core/domain/shared/Result';
import { useResultMutation } from '@core/presentation/query/useResultMutation';
import type { SignInError, SignInInput } from '@features/auth/application/use-cases/SignIn';

import { useAuthServices } from '../services/AuthServices';
import { useAccessStore } from '../state/accessStore';

/**
 * Signs in with what the user typed. On success the app is open (the state moves to `Unlocked`),
 * and nothing of the sign-in stays behind: the answer (the session, with a name and an email) is
 * dropped, and so is the password, which never becomes the input of the mutation. TanStack Query
 * keeps the variables of a mutation next to its state for as long as the screen observes it, so the
 * credentials are handed over in a reference that the mutation function empties as it reads it,
 * and the mutation itself takes no input. What is guaranteed, and tested, is that no mutation of the
 * query client holds the password, as its variables or in its state; the string itself lives in the
 * JavaScript runtime until it is collected.
 *
 * Failures are the errors of `SignIn`: a field the domain refuses (`validation`, with the field and
 * the rule), the credentials refused, the server unreachable, a fault of the server or of the
 * storage. None is retried, and a second call while one is under way is ignored: there is no retry
 * storm to be had from a button, a keyboard's "go" key or both at once.
 */
export function useSignIn() {
  const { signIn: signInUseCase } = useAuthServices();
  const signedIn = useAccessStore((state) => state.signedIn);
  const credentials = useRef<SignInInput | undefined>(undefined);

  const mutation = useResultMutation<void, void, SignInError>({
    execute: async () => {
      const typed = credentials.current;
      credentials.current = undefined;
      if (typed === undefined) return err(unexpected());
      return map(await signInUseCase.execute(typed), () => undefined);
    },
    onSuccess: signedIn,
  });

  const { run } = mutation;
  const signIn = useCallback(
    (typed: SignInInput) => {
      credentials.current = typed;
      run();
    },
    [run],
  );

  return {
    signIn,
    isPending: mutation.isPending,
    failure: mutation.failure,
    reset: mutation.reset,
  };
}
