import { createSubscribers } from './subscribers';

describe('createSubscribers', () => {
  it('calls every listener with the value, in the order they subscribed', () => {
    const subscribers = createSubscribers<number>(() => undefined);
    const calls: string[] = [];
    subscribers.subscribe((value) => calls.push(`a${value}`));
    subscribers.subscribe((value) => calls.push(`b${value}`));

    subscribers.notify(1);

    expect(calls).toEqual(['a1', 'b1']);
  });

  it('makes a subscription of its own each time, even for the same function', () => {
    const subscribers = createSubscribers<number>(() => undefined);
    const listener = jest.fn();
    const stopFirst = subscribers.subscribe(listener);
    subscribers.subscribe(listener);

    subscribers.notify(1);
    stopFirst();
    subscribers.notify(2);

    expect(listener.mock.calls).toEqual([[1], [1], [2]]);
    expect(subscribers.size).toBe(1);
  });

  it('removes a subscription once: removing it again leaves the others', () => {
    const subscribers = createSubscribers<number>(() => undefined);
    const kept = jest.fn();
    const stop = subscribers.subscribe(() => undefined);
    subscribers.subscribe(kept);

    stop();
    stop();
    subscribers.notify(1);

    expect(kept).toHaveBeenCalledTimes(1);
    expect(subscribers.size).toBe(1);
  });

  it('reports a listener that throws, calls the ones after it, and does not throw', () => {
    const errors: unknown[] = [];
    const subscribers = createSubscribers<number>((error) => errors.push(error));
    const after = jest.fn();
    const failure = new Error('broken listener');
    subscribers.subscribe(() => {
      throw failure;
    });
    subscribers.subscribe(after);

    expect(() => {
      subscribers.notify(1);
    }).not.toThrow();

    expect(after).toHaveBeenCalledWith(1);
    expect(errors).toEqual([failure]);
  });

  it('applies a subscription made while it notifies to the next value', () => {
    const subscribers = createSubscribers<number>(() => undefined);
    const late = jest.fn();
    subscribers.subscribe(() => {
      subscribers.subscribe(late);
    });

    subscribers.notify(1);
    expect(late).not.toHaveBeenCalled();
    subscribers.notify(2);

    expect(late).toHaveBeenCalledWith(2);
  });
});
