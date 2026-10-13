import { timerSleep } from './sleep';

afterEach(() => {
  jest.useRealTimers();
});

describe('timerSleep', () => {
  it('resolves once the delay has passed, and not before', async () => {
    jest.useFakeTimers();
    const settled = jest.fn();

    const waiting = timerSleep(500).then(settled);
    await jest.advanceTimersByTimeAsync(499);
    expect(settled).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await waiting;
    expect(settled).toHaveBeenCalledTimes(1);
  });
});
