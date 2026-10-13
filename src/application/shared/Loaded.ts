import type { ValueOf } from '@domain/shared/constants';
import type { Instant } from '@domain/value-objects/Instant';

/** Whether data comes straight from the remote source, or from the local cache. */
export const FRESHNESS = {
  Fresh: 'fresh',
  Stale: 'stale',
} as const;

export type Freshness = ValueOf<typeof FRESHNESS>;

/** Where data comes from. Stale data says when it was cached, so a screen can show its age. */
export type DataSource =
  | { readonly freshness: typeof FRESHNESS.Fresh }
  | { readonly freshness: typeof FRESHNESS.Stale; readonly cachedAt: Instant };

/**
 * Data, where it comes from, and the instant it was produced at. The instant is the one of the
 * clock when the use case answered, for saved data as well as for fresh data: it is the "now" that
 * a screen needs to judge what depends on time (is a voting window over?) without reading a clock
 * itself. For saved data it is not `cachedAt`, which says how old the copy is.
 */
export interface Loaded<T> {
  readonly data: T;
  readonly source: DataSource;
  readonly loadedAt: Instant;
}
