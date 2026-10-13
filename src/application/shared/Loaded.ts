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

/** Data and where it comes from. */
export interface Loaded<T> {
  readonly data: T;
  readonly source: DataSource;
}
