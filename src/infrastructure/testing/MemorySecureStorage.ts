import type { SecureStorage } from '../secure-storage/SecureStorage';

// Test support, not production code: the secure storage of the tests, in memory. It can be made to
// fail, to hang, and to show what it holds, so that the logic that sits on top of it is tested.

export class MemorySecureStorage implements SecureStorage {
  private readonly items = new Map<string, string>();
  private failures = 0;
  private hanging = false;

  /** The next `count` calls reject, then it works again. */
  failNext(count = 1): void {
    this.failures = count;
  }

  /** Every call waits for ever while set. */
  hang(hanging = true): void {
    this.hanging = hanging;
  }

  /** What it holds, to see what was and was not stored. */
  snapshot(): Readonly<Record<string, string>> {
    return Object.fromEntries(this.items);
  }

  /** Puts a value in without going through the interface. */
  seed(key: string, value: string): void {
    this.items.set(key, value);
  }

  get(key: string): Promise<string | undefined> {
    return this.run(() => this.items.get(key));
  }

  set(key: string, value: string): Promise<void> {
    return this.run(() => {
      this.items.set(key, value);
    });
  }

  remove(key: string): Promise<void> {
    return this.run(() => {
      this.items.delete(key);
    });
  }

  private run<T>(operation: () => T): Promise<T> {
    if (this.hanging) return new Promise<T>(() => undefined);
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(new Error('the secure storage is unavailable'));
    }
    return Promise.resolve(operation());
  }
}
