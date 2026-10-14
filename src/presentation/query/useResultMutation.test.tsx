import { act, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { unexpected } from '@domain/errors/RepositoryError';
import type { UnexpectedError } from '@domain/errors/RepositoryError';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { epochOf } from '../testing/accessEpoch';
import { renderScreen } from '../testing/renderScreen';

import { QueryFailure } from './QueryFailure';
import { useResultMutation } from './useResultMutation';

// THE CONVENTION for an action of the user: a use case behind a mutation, its Result turned into
// mutation state the way a query does it, never retried, never run twice at once.

const RESET = 'reset';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

interface Fault {
  readonly code: 'tooBad';
  readonly detail: string;
}

type Outcome = Result<string, Fault | UnexpectedError>;

/** A component that runs an action and shows what the convention gives back. */
function setup(
  execute: (input: number) => Promise<Outcome>,
  extra: { onSuccess?: jest.Mock; onFailure?: jest.Mock } = {},
) {
  const calls: number[] = [];
  const state: { run: (input: number) => void } = { run: () => undefined };
  function Probe() {
    const mutation = useResultMutation<number, string, Fault | UnexpectedError>({
      execute: (input) => {
        calls.push(input);
        return execute(input);
      },
      ...(extra.onSuccess === undefined ? {} : { onSuccess: extra.onSuccess }),
      ...(extra.onFailure === undefined ? {} : { onFailure: extra.onFailure }),
    });
    state.run = mutation.run;
    const text = `${mutation.isPending ? 'pending' : 'idle'}|${mutation.failure?.code ?? 'none'}`;
    return (
      <>
        <Text>{text}</Text>
        <Text onPress={mutation.reset}>{RESET}</Text>
      </>
    );
  }
  const rendered = renderScreen(<Probe />);
  return { ...rendered, calls, run: (input: number) => act(() => state.run(input)) };
}

describe('useResultMutation', () => {
  it('runs the use case with the input, and has no failure when it succeeds', async () => {
    const onSuccess = jest.fn();
    const { calls, run, uiStore } = setup(() => Promise.resolve(ok('done')), { onSuccess });

    run(7);
    await settle();

    expect(calls).toEqual([7]);
    expect(onSuccess).toHaveBeenCalledWith('done', 7, epochOf(uiStore));
    expect(screen.getByText('idle|none')).toBeTruthy();
  });

  it('is pending while the use case runs, and stays pending until onSuccess has settled', async () => {
    let finishRefresh: () => void = () => undefined;
    const onSuccess = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishRefresh = resolve;
        }),
    );
    const { run } = setup(() => Promise.resolve(ok('done')), { onSuccess });

    run(1);
    await settle();
    expect(screen.getByText('pending|none')).toBeTruthy();

    await act(async () => {
      finishRefresh();
    });
    await settle();
    expect(screen.getByText('idle|none')).toBeTruthy();
  });

  it('turns the error of the use case into a typed failure, and tells onFailure', async () => {
    const fault: Fault = { code: 'tooBad', detail: 'the detail' };
    const onFailure = jest.fn();
    const { run, uiStore } = setup(() => Promise.resolve(err(fault)), { onFailure });

    run(3);
    await settle();

    expect(screen.getByText('idle|tooBad')).toBeTruthy();
    expect(onFailure).toHaveBeenCalledWith(fault, 3, epochOf(uiStore));
  });

  it('never tries again, whatever the error: the use case is asked once', async () => {
    const execute = jest.fn((): Promise<Outcome> => Promise.resolve(err(unexpected())));
    const { run } = setup(execute);

    run(1);
    await settle();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(60_000);
    });

    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('ignores a second run while one is under way, even in the same tick', async () => {
    let finish: (outcome: Outcome) => void = () => undefined;
    const execute = jest.fn(
      () =>
        new Promise<Outcome>((resolve) => {
          finish = resolve;
        }),
    );
    const { calls, run } = setup(execute);

    act(() => {
      run(1);
      run(2);
    });
    run(3);
    await settle();
    expect(calls).toEqual([1]);

    await act(async () => {
      finish(ok('done'));
    });
    await settle();
    run(4);
    await settle();

    expect(calls).toEqual([1, 4]);
  });

  it('can run again after a failure', async () => {
    const outcomes: Outcome[] = [err(unexpected()), ok('done')];
    const { calls, run } = setup(() => Promise.resolve(outcomes.shift() as Outcome));

    run(1);
    await settle();
    expect(screen.getByText('idle|unexpected')).toBeTruthy();
    run(2);
    await settle();

    expect(calls).toEqual([1, 2]);
    expect(screen.getByText('idle|none')).toBeTruthy();
  });

  it('forgets the failure when it is reset', async () => {
    const { run } = setup(() => Promise.resolve(err(unexpected())));
    run(1);
    await settle();
    expect(screen.getByText('idle|unexpected')).toBeTruthy();

    await act(async () => {
      screen.getByText(RESET).props.onPress();
    });
    await settle();

    expect(screen.getByText('idle|none')).toBeTruthy();
  });

  it('reads a use case that rejects, instead of answering, as an unexpected failure', async () => {
    const { run } = setup(() => Promise.reject(new Error('a bug')));

    run(1);
    await settle();

    expect(screen.getByText('idle|unexpected')).toBeTruthy();
  });

  it('reads a failure that is a QueryFailure of another shape by its code, as the queries do', async () => {
    const failure = new QueryFailure({ code: 'tooBad' });
    const { run } = setup(() => Promise.reject(failure));

    run(1);
    await settle();

    expect(screen.getByText('idle|tooBad')).toBeTruthy();
  });
});
