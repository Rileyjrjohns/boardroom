import type { Clock } from '@core/application/ports/Clock';
import { parseInstant } from '@core/domain/value-objects/Instant';
import type { Instant } from '@core/domain/value-objects/Instant';

import { valid } from '../shared/valid';

/** Reads the clock of the device, in milliseconds since the Unix epoch. */
export type ReadMillis = () => number;

/** What a device whose clock reads before 1970 or nonsense is taken to say. */
const EPOCH: Instant = valid(parseInstant(0));

/**
 * The clock of the device. The only production code that reads the system time, which is why the
 * domain and the application cannot (a lint rule forbids it there). `now()` never fails: a
 * fractional reading is truncated, and one that is not an instant at all (a clock set before 1970,
 * a non-finite value) reads as the epoch, instead of throwing.
 */
export class SystemClock implements Clock {
  constructor(private readonly readMillis: ReadMillis = Date.now) {}

  now(): Instant {
    const reading = this.readMillis();
    const whole = Number.isFinite(reading) ? Math.trunc(reading) : 0;
    const parsed = parseInstant(Math.max(0, whole));
    return parsed.ok ? parsed.value : EPOCH;
  }
}
