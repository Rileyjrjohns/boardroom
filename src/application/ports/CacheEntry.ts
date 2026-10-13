import type { Instant } from '@domain/value-objects/Instant';

/** A value read back from a local cache, with the instant it was stored at. */
export interface CacheEntry<T> {
  readonly value: T;
  /**
   * The instant given to the `save` call that stored the value, not one the cache reads itself.
   * The application compares it with the clock to refuse an entry that is too old or that is dated
   * in the future.
   */
  readonly cachedAt: Instant;
}
