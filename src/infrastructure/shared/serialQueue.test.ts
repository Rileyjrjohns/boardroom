import { createSerialQueue } from './serialQueue';

/** A job that settles when the test says so. */
function controlled<T>() {
  let settle: (value: T) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

describe('createSerialQueue', () => {
  it('runs the jobs one at a time, in the order they were asked for, whatever the order they settle in', async () => {
    const queue = createSerialQueue();
    const log: string[] = [];
    const first = controlled<string>();
    const second = controlled<string>();

    const a = queue(async () => {
      log.push('start a');
      const value = await first.promise;
      log.push('end a');
      return value;
    });
    const b = queue(async () => {
      log.push('start b');
      const value = await second.promise;
      log.push('end b');
      return value;
    });
    second.settle('b');
    await Promise.resolve();
    expect(log).toEqual(['start a']);
    first.settle('a');

    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
    expect(log).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('gives each caller what its own job gave', async () => {
    const queue = createSerialQueue();

    expect(
      await Promise.all([queue(() => Promise.resolve(1)), queue(() => Promise.resolve('x'))]),
    ).toEqual([1, 'x']);
  });

  it('keeps going after a job fails, and gives the failure to the caller of that job only', async () => {
    const queue = createSerialQueue();
    const failing = queue(() => Promise.reject(new Error('a failure')));
    const after = queue(() => Promise.resolve('still running'));

    await expect(failing).rejects.toThrow('a failure');
    expect(await after).toBe('still running');
  });

  it('keeps going after a job throws before it returns a promise', async () => {
    const queue = createSerialQueue();
    const throwing = queue((): Promise<never> => {
      throw new Error('synchronous');
    });
    const after = queue(() => Promise.resolve(2));

    await expect(throwing).rejects.toThrow('synchronous');
    expect(await after).toBe(2);
  });

  it('keeps one queue apart from another', async () => {
    const one = createSerialQueue();
    const other = createSerialQueue();
    const blocked = controlled<number>();
    void one(() => blocked.promise);

    expect(await other(() => Promise.resolve('free'))).toBe('free');
    blocked.settle(0);
  });
});
