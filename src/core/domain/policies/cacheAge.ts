import type { Duration } from '../value-objects/Duration';
import { millisBetween } from '../value-objects/Instant';
import type { Instant } from '../value-objects/Instant';

/**
 * May a cached entry still be shown as stale data? Yes while it is no older than `maxAge`: an entry
 * of exactly that age is still good, one millisecond older is not. An entry dated in the future
 * (the clock of the device was set back since it was stored) cannot be dated at all, so it is not
 * trusted: the rule fails closed.
 */
export function isWithinMaxAge(cachedAt: Instant, now: Instant, maxAge: Duration): boolean {
  const age = millisBetween(cachedAt, now);
  return age >= 0 && age <= maxAge;
}
