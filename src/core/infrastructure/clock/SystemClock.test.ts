import { SystemClock } from './SystemClock';

describe('SystemClock', () => {
  it('reads the time of the device through the function it is given', () => {
    const clock = new SystemClock(() => 1_900_000_000_123);

    expect(clock.now()).toBe(1_900_000_000_123);
  });

  it('reads the real clock by default', () => {
    const before = Date.now();
    const reading = new SystemClock().now();
    const after = Date.now();

    expect(reading).toBeGreaterThanOrEqual(before);
    expect(reading).toBeLessThanOrEqual(after);
  });

  it('follows the clock as it moves', () => {
    let millis = 1000;
    const clock = new SystemClock(() => millis);

    expect(clock.now()).toBe(1000);
    millis = 2500;
    expect(clock.now()).toBe(2500);
  });

  it.each([
    ['a fractional reading', 1500.9, 1500],
    ['a reading before 1970', -5000, 0],
    ['a reading that is not a number', Number.NaN, 0],
    ['an infinite reading', Number.POSITIVE_INFINITY, 0],
    ['a reading beyond the range of an instant', 9_000_000_000_000_000, 0],
  ])('never fails on %s', (_name, reading, expected) => {
    expect(new SystemClock(() => reading).now()).toBe(expected);
  });
});
