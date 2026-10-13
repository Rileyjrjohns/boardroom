import { createQueryClient } from './createQueryClient';
import { retryDelay, shouldRetry } from './retryPolicy';

describe('createQueryClient', () => {
  it('creates a new client at every call: two apps never share a cache', () => {
    // `Infinity` sets no timer to collect the query, which would keep the test process alive.
    const first = createQueryClient({ gcTime: Infinity });
    const second = createQueryClient({ gcTime: Infinity });

    first.setQueryData(['key'], 'value');

    expect(first).not.toBe(second);
    expect(second.getQueryData(['key'])).toBeUndefined();
  });

  it('retries according to the error code, with the delay of the policy', () => {
    const { queries } = createQueryClient().getDefaultOptions();

    expect(queries?.retry).toBe(shouldRetry);
    expect(queries?.retryDelay).toBe(retryDelay);
  });

  it('refetches nothing by itself: there is no window focus, and the screens refresh on demand', () => {
    const { queries } = createQueryClient().getDefaultOptions();

    expect(queries?.refetchOnWindowFocus).toBe(false);
    expect(queries?.refetchOnReconnect).toBe(false);
  });

  it('lets a test choose the delay of the retries and how long unused data is kept', () => {
    const delay = () => 0;
    const { queries } = createQueryClient({
      retryDelay: delay,
      gcTime: Infinity,
    }).getDefaultOptions();

    expect(queries?.retryDelay).toBe(delay);
    expect(queries?.gcTime).toBe(Infinity);
  });
});
