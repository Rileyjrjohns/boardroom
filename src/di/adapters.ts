import type { ValueOf } from '@domain/shared/constants';

/**
 * The two ways of wiring the app: against the in-memory adapters (a simulated server, no network
 * needed), or against the real ones (HTTP and SQLite). The values are what `EXPO_PUBLIC_BOARDROOM_ADAPTERS`
 * accepts.
 */
export const ADAPTERS = {
  Mock: 'mock',
  Http: 'http',
} as const;

export type Adapters = ValueOf<typeof ADAPTERS>;
