import type { Instant } from '@domain/value-objects/Instant';
import { NOW, after } from '@domain/testing/builders';

import type { Clock } from '../ports/Clock';

/** A clock that only moves when the test says so. */
export class FakeClock implements Clock {
  private current: Instant;

  constructor(initial: Instant = NOW) {
    this.current = initial;
  }

  now(): Instant {
    return this.current;
  }

  set(instant: Instant): void {
    this.current = instant;
  }

  advance(millis: number): void {
    this.current = after(this.current, millis);
  }
}
