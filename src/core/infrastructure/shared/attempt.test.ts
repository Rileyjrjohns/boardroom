import { ATTEMPT_FAILURE, attempt, describeFailure } from './attempt';

const SOON = 20;
const LONG_AFTER = 5000;

describe('attempt', () => {
  it('gives the value of work that succeeds', async () => {
    expect(await attempt(() => Promise.resolve(42), LONG_AFTER)).toStrictEqual({
      ok: true,
      value: 42,
    });
  });

  it('gives a failure for work that rejects, with a cause that holds no message', async () => {
    const result = await attempt(() => Promise.reject(new Error('secret path /tmp/x')), LONG_AFTER);

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: ATTEMPT_FAILURE.Failed, cause: 'unknown failure' },
    });
  });

  it('gives a failure for work that throws before it returns a promise', async () => {
    const result = await attempt((): Promise<number> => {
      throw new Error('boom');
    }, LONG_AFTER);

    expect(result).toMatchObject({ ok: false, error: { kind: ATTEMPT_FAILURE.Failed } });
  });

  it('times out on work that never settles, and ignores what it does afterwards', async () => {
    let rejectLater: (reason: Error) => void = () => undefined;
    const hanging = new Promise<number>((_resolve, reject) => {
      rejectLater = reject;
    });

    const result = await attempt(() => hanging, SOON);
    rejectLater(new Error('too late'));

    expect(result).toStrictEqual({
      ok: false,
      error: { kind: ATTEMPT_FAILURE.TimedOut, cause: 'timeout' },
    });
  });

  it('does not leave its timer running when the work is done', async () => {
    jest.useFakeTimers();
    try {
      await attempt(() => Promise.resolve(1), LONG_AFTER);

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('describeFailure', () => {
  it('names the SQLite error code of a database failure', () => {
    expect(
      describeFailure({ errcode: 13, message: 'database or disk is full: /secret/path' }),
    ).toBe('sqlite error 13');
  });

  it('keeps the code of a failure that has one in the form of a code', () => {
    expect(describeFailure({ code: 'ERR_SQLITE_ERROR' })).toBe('ERR_SQLITE_ERROR');
  });

  it.each([
    ['a code with free text', { code: 'file /secret/path not found' }],
    ['a code that is not a string', { code: 12 }],
    ['an error code that is not an integer', { errcode: 1.5 }],
    ['an object without a code', {}],
    ['null', null],
    ['a string', 'boom'],
    ['undefined', undefined],
  ])('says nothing specific about %s', (_name, error) => {
    expect(describeFailure(error)).toBe('unknown failure');
  });
});
