import { useCallback, useRef } from 'react';

import { unexpected } from '@domain/errors/RepositoryError';
import { err, map } from '@domain/shared/Result';
import type { SignInError, SignInInput } from '@application/use-cases/auth/SignIn';

import { useResultMutation } from '../query/useResultMutation';
import { useAppServices } from '../services/AppServices';
import { useUiStore } from '../state/uiStore';

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
  const { useCases } = useAppServices();
  const signedIn = useUiStore((state) => state.signedIn);
  const credentials = useRef<SignInInput | undefined>(undefined);

  const mutation = useResultMutation<void, void, SignInError>({
    execute: async () => {
      const typed = credentials.current;
      credentials.current = undefined;
      if (typed === undefined) return err(unexpected());
      return map(await useCases.signIn.execute(typed), () => undefined);
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
