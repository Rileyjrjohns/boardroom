import type { Instant } from '@core/domain/value-objects/Instant';

/**
 * The only way the domain and the application read the time. Business code never calls
 * `Date.now()` (a lint rule forbids it), so every rule that depends on time can be tested with a
 * clock that is set by hand.
 */
export interface Clock {
  /**
   * The current instant, on the clock of the device. Never fails. The device clock is not
   * trustworthy (the user can set it), which the rules built on it account for: see
   * "Clock limits" in docs/design-in-depth.md.
   */
  now(): Instant;
}
