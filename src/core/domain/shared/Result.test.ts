import { andThen, andThenAsync, err, isErr, isOk, map, ok } from './Result';
import type { Result } from './Result';

const success: Result<number, string> = ok(2);
const failure: Result<number, string> = err('boom');

describe('Result', () => {
  it('builds a success and a failure', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('e')).toEqual({ ok: false, error: 'e' });
  });

  it('tells a success from a failure with the type guards', () => {
    expect(isOk(success)).toBe(true);
    expect(isOk(failure)).toBe(false);
    expect(isErr(failure)).toBe(true);
    expect(isErr(success)).toBe(false);
    expect([success, failure].filter(isOk)).toEqual([success]);
  });

  it('tells a failure from a success even when the value or the error is undefined', () => {
    expect(isErr(err(undefined))).toBe(true);
    expect(isOk(err(undefined))).toBe(false);
    expect(isOk(ok(undefined))).toBe(true);
    expect(isErr(ok(undefined))).toBe(false);
  });

  describe('map', () => {
    it('transforms the value of a success', () => {
      expect(map(success, (value) => value * 10)).toEqual(ok(20));
    });

    it('leaves a failure untouched and does not call the transformation', () => {
      let calls = 0;
      const transform = (value: number) => {
        calls += 1;
        return value;
      };

      expect(map(failure, transform)).toBe(failure);
      expect(calls).toBe(0);
    });
  });

  describe('andThen', () => {
    it('runs the next step on a success and returns its result', () => {
      expect(andThen(success, (value) => ok(value + 1))).toEqual(ok(3));
      expect(andThen(success, () => err('later'))).toEqual(err('later'));
    });

    it('short-circuits on a failure', () => {
      let calls = 0;
      const next = () => {
        calls += 1;
        return ok(0);
      };

      expect(andThen(failure, next)).toBe(failure);
      expect(calls).toBe(0);
    });
  });

  describe('andThenAsync', () => {
    it('runs the next step on a success, given directly or as a promise', async () => {
      const next = (value: number) => Promise.resolve(ok(value + 1));

      await expect(andThenAsync(success, next)).resolves.toEqual(ok(3));
      await expect(andThenAsync(Promise.resolve(success), next)).resolves.toEqual(ok(3));
    });

    it('returns the failure of the next step', async () => {
      await expect(andThenAsync(success, () => Promise.resolve(err('later')))).resolves.toEqual(
        err('later'),
      );
    });

    it('short-circuits on a failure', async () => {
      let calls = 0;
      const next = () => {
        calls += 1;
        return Promise.resolve(ok(0));
      };

      await expect(andThenAsync(Promise.resolve(failure), next)).resolves.toBe(failure);
      expect(calls).toBe(0);
    });
  });
});
