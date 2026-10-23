import { MILLIS_PER_MINUTE, NOW, aDuration, at } from '@testing/domain/builders';

import { isUnlockRequired } from './appLock';

const GRACE = aDuration(30_000);

describe('isUnlockRequired', () => {
  const base = { backgroundedAt: NOW, gracePeriod: GRACE, hasSession: true };

  it('is false when the app comes back within the grace period', () => {
    expect(isUnlockRequired({ ...base, now: at(29_999) })).toBe(false);
    expect(isUnlockRequired({ ...base, now: NOW })).toBe(false);
  });

  it('is true once the grace period has elapsed, the boundary included', () => {
    expect(isUnlockRequired({ ...base, now: at(30_000) })).toBe(true);
    expect(isUnlockRequired({ ...base, now: at(MILLIS_PER_MINUTE) })).toBe(true);
  });

  it('locks every time when the grace period is zero', () => {
    expect(isUnlockRequired({ ...base, gracePeriod: aDuration(0), now: NOW })).toBe(true);
  });

  it('is false without a session, whatever the time spent away', () => {
    expect(isUnlockRequired({ ...base, hasSession: false, now: at(MILLIS_PER_MINUTE) })).toBe(
      false,
    );
  });

  it('fails closed when the clock has been set back', () => {
    expect(isUnlockRequired({ ...base, now: at(-1) })).toBe(true);
  });
});
