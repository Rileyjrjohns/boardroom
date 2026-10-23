import { QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { notFound, unauthorized, unexpected } from '@core/domain/errors/RepositoryError';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import { CORE_ERROR_CATALOG } from '../errors/ErrorCatalog';
import { trackClient } from '../testing/queryClients';

import { createQueryClient } from './createQueryClient';
import { QueryFailure, failureOf, isQueryFailure, unwrapResult } from './QueryFailure';

describe('unwrapResult', () => {
  it('gives the value of a success', () => {
    expect(unwrapResult(ok(42))).toBe(42);
  });

  it('throws the error of a failure in a QueryFailure that carries it', () => {
    expect(() => unwrapResult(err(notFound()))).toThrow(QueryFailure);
    try {
      unwrapResult(err(unauthorized()));
    } catch (thrown) {
      expect(isQueryFailure(thrown) && thrown.error).toEqual(unauthorized());
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toBe('unauthorized');
    }
  });
});

describe('isQueryFailure', () => {
  it('recognises a QueryFailure and nothing else', () => {
    expect(isQueryFailure(new QueryFailure(notFound()))).toBe(true);
    expect(isQueryFailure(new Error('notFound'))).toBe(false);
    expect(isQueryFailure({ code: 'notFound' })).toBe(false);
    expect(isQueryFailure(undefined)).toBe(false);
  });
});

// The convention, run through a real query client: the `Result` of a use case becomes the state
// of the query, and a failure keeps the data of the last success.
describe('the Result to query state convention', () => {
  let answers: Result<string, ReturnType<typeof unexpected> | ReturnType<typeof notFound>>[] = [];

  function Probe() {
    const { data, error, isError, isSuccess } = useQuery<string, QueryFailure<{ code: string }>>({
      queryKey: ['probe'],
      queryFn: () => {
        const answer = answers.shift();
        if (answer === undefined) throw new Error('no answer scripted');
        return Promise.resolve(unwrapResult(answer));
      },
    });
    const text = `${isSuccess} ${isError} ${data ?? '-'} ${error?.error.code ?? '-'}`;
    return <Text>{text}</Text>;
  }

  function renderProbe(children: ReactNode = <Probe />) {
    const client = trackClient(
      createQueryClient({
        errorCatalog: CORE_ERROR_CATALOG,
        isSessionEndingCode: () => false,
        retryDelay: () => 0,
      }),
    );
    render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
    return client;
  }

  it('turns a success into data', async () => {
    answers = [ok('first')];
    renderProbe();

    expect(await screen.findByText('true false first -')).toBeTruthy();
  });

  it('turns a failure into the error state, with the code of the error', async () => {
    answers = [err(notFound())];
    renderProbe();

    expect(await screen.findByText('false true - notFound')).toBeTruthy();
  });

  it('keeps the data of the last success next to the error of a failed refetch', async () => {
    // A failure that can pass is retried, so it is scripted for every attempt.
    answers = [ok('first'), err(unexpected()), err(unexpected()), err(unexpected())];
    const client = renderProbe();
    await screen.findByText('true false first -');

    await act(async () => {
      await client.refetchQueries();
    });

    expect(await screen.findByText('false true first unexpected')).toBeTruthy();
  });

  it('drops the data of the last success when the refetch says the item is gone', async () => {
    answers = [ok('first'), err(notFound())];
    const client = renderProbe();
    await screen.findByText('true false first -');

    await act(async () => {
      await client.refetchQueries();
    });

    expect(await screen.findByText('false true - notFound')).toBeTruthy();
    expect(client.getQueryData(['probe'])).toBeUndefined();
  });

  it('retries a failure that a retry can fix, and not one that it cannot', async () => {
    answers = [err(unexpected()), err(unexpected()), ok('third')];
    renderProbe();
    expect(await screen.findByText('true false third -')).toBeTruthy();

    answers = [err(notFound()), ok('never read')];
    renderProbe();
    await screen.findByText(/false true - notFound/);
    expect(answers).toHaveLength(1);
  });
});

describe('failureOf', () => {
  it('gives back the error of a QueryFailure, as the use case returned it', () => {
    const error = { code: 'alreadyVoted', source: 'recorded' } as const;

    expect(failureOf(new QueryFailure(error))).toBe(error);
  });

  it.each([new Error('boom'), 'a string', undefined, null, { code: 'notAFailure' }])(
    'reads %p, which is no failure of a use case, as unexpected',
    (rejection) => {
      expect(failureOf(rejection)).toEqual(unexpected());
    },
  );
});
