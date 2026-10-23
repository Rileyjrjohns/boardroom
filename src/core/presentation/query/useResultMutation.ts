import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';

import { useUiStoreApi } from '@composition/shell/state/uiStore';
import type { UnexpectedError } from '@core/domain/errors/RepositoryError';
import type { Result } from '@core/domain/shared/Result';

import { failureOf, unwrapResult } from './QueryFailure';
import type { CodedError, QueryFailure } from './QueryFailure';

export interface ResultMutationOptions<Input, Output, E extends CodedError> {
  /** The use case. Its `Result` is turned into mutation state the way `QueryFailure` says. */
  readonly execute: (input: Input) => Promise<Result<Output, E>>;
  /**
   * Runs when the use case succeeded, and the mutation stays pending until it settles: a screen
   * that refreshes what the action changed keeps its button busy until the refresh is done.
   */
  readonly onSuccess?: (output: Output, input: Input, startedUnder: number) => void | Promise<void>;
  /**
   * Runs when the use case failed, with the error it returned, for what the failure leaves stale.
   * Both callbacks are told the epoch of the access the action started under (see `uiStore`), for
   * the ones that move the user and must not do it for somebody else.
   */
  readonly onFailure?: (
    failure: E | UnexpectedError,
    input: Input,
    startedUnder: number,
  ) => void | Promise<void>;
}

export interface ResultMutation<Input, E extends CodedError> {
  /**
   * Starts the action. Ignored while one is under way: the answer of a double tap, in the same
   * tick, before the screen has re-rendered with its button disabled.
   */
  run(input: Input): void;
  readonly isPending: boolean;
  /** Why the last run failed, typed with the errors of the use case. `undefined` otherwise. */
  readonly failure: E | UnexpectedError | undefined;
  /** Forgets the failure. */
  reset(): void;
}

/**
 * THE CONVENTION for an action of the user (sign in, unlock, sign out, cast a vote, acknowledge a
 * rejected vote). It is the mutation counterpart of `unwrapResult`:
 *
 * - the mutation function calls a use case, never an adapter, and throws a `QueryFailure` for its
 *   error, so the mutation goes to its error state and `failure` is typed with the errors of that
 *   use case;
 * - it is never retried, whatever the error: an action is repeated by the user, not by the library
 *   (`createQueryClient` sets it for every mutation, and this hook does too);
 * - a second `run` while one is under way is ignored, so a double tap acts once even before the
 *   screen has re-rendered;
 * - the keys of the queries that the action makes stale are refreshed from `onSuccess`, through
 *   the key factory (`queryKeys`), never optimistically: what the screen shows afterwards is what
 *   the use cases answer;
 * - nothing of the action stays in memory once its screen is gone (`createQueryClient` drops a
 *   mutation as soon as nothing observes it);
 * - a failure carries the epoch of the access the action started under, so that one which ends the
 *   session does so only for the session it started in.
 */
export function useResultMutation<Input, Output, E extends CodedError>(
  options: ResultMutationOptions<Input, Output, E>,
): ResultMutation<Input, E> {
  const running = useRef(false);
  const startedUnder = useRef(0);
  const store = useUiStoreApi();

  const mutation = useMutation<Output, QueryFailure<E>, Input>({
    // The failure says which access the action started under: the user who left is not to end the
    // session of the one who came after (see `QueryFailure`).
    mutationFn: async (input) => unwrapResult(await options.execute(input), startedUnder.current),
    retry: false,
    onSuccess: async (output, input) => {
      await options.onSuccess?.(output, input, startedUnder.current);
    },
    onError: async (error, input) => {
      await options.onFailure?.(failureOf<E>(error), input, startedUnder.current);
    },
    onSettled: () => {
      running.current = false;
    },
  });

  const { mutate } = mutation;
  const run = useCallback(
    (input: Input) => {
      if (running.current) return;
      running.current = true;
      startedUnder.current = store.getState().accessEpoch;
      mutate(input);
    },
    [mutate, store],
  );

  return {
    run,
    isPending: mutation.isPending,
    failure: mutation.isError ? failureOf<E>(mutation.error) : undefined,
    reset: mutation.reset,
  };
}
