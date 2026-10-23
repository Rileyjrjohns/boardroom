import { NOW, aDuration, at } from '@testing/domain/builders';

import { isWithinMaxAge } from './cacheAge';

const MAX_AGE = aDuration(60_000);

describe('isWithinMaxAge', () => {
  it('accepts an entry that was just stored', () => {
    expect(isWithinMaxAge(NOW, NOW, MAX_AGE)).toBe(true);
  });

  it('accepts an entry younger than the maximum age, and one of exactly that age', () => {
    expect(isWithinMaxAge(at(-59_999), NOW, MAX_AGE)).toBe(true);
    expect(isWithinMaxAge(at(-60_000), NOW, MAX_AGE)).toBe(true);
  });

  it('refuses an entry older than the maximum age, by one millisecond already', () => {
    expect(isWithinMaxAge(at(-60_001), NOW, MAX_AGE)).toBe(false);
  });

  it('refuses an entry dated in the future, by one millisecond already', () => {
    expect(isWithinMaxAge(at(1), NOW, MAX_AGE)).toBe(false);
    expect(isWithinMaxAge(at(3_600_000), NOW, MAX_AGE)).toBe(false);
  });

  it('with a maximum age of zero, only an entry stored at this very instant is accepted', () => {
    expect(isWithinMaxAge(NOW, NOW, aDuration(0))).toBe(true);
    expect(isWithinMaxAge(at(-1), NOW, aDuration(0))).toBe(false);
  });
});
