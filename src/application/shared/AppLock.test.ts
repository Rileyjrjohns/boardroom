import { AppLock } from './AppLock';

describe('AppLock', () => {
  it('starts locked: a process that has proven nothing fails closed', () => {
    expect(new AppLock().isLocked()).toBe(true);
  });

  it('can be made to start unlocked', () => {
    expect(new AppLock({ locked: false }).isLocked()).toBe(false);
  });

  it('opens and closes', () => {
    const lock = new AppLock();

    lock.unlock();
    expect(lock.isLocked()).toBe(false);
    lock.lock();
    expect(lock.isLocked()).toBe(true);
  });

  it('is idempotent in both directions', () => {
    const lock = new AppLock({ locked: false });

    lock.unlock();
    lock.unlock();
    expect(lock.isLocked()).toBe(false);
    lock.lock();
    lock.lock();
    expect(lock.isLocked()).toBe(true);
  });

  it('keeps its state to itself: two locks do not share it', () => {
    const first = new AppLock();
    const second = new AppLock();

    first.unlock();

    expect(second.isLocked()).toBe(true);
  });
});
