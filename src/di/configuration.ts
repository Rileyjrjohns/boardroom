import { findConstant, valuesOf } from '@domain/shared/constants';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';

import { ADAPTERS } from './adapters';
import { MOCK_STARTS_SIGNED_IN, SIMULATED_LATENCY } from './config';
import { invalidAdaptersSetting } from './errors';
import type { ContainerError } from './errors';

/** The app against the simulated server and the in-memory adapters. */
export interface MockConfiguration {
  readonly kind: typeof ADAPTERS.Mock;
  /** Whether the demo user is signed in at start. Named, so that the day it goes away is visible. */
  readonly startSignedIn: boolean;
  /** How long the simulated server takes to answer. */
  readonly latency: Duration;
}

/**
 * The app against the real adapters (HTTP, SQLite). It exists so that the choice is complete in
 * the type system, but nothing is wired to it yet: `createContainer` answers
 * `configurationNotAvailable`. The adapters, and the options they need (a base URL, say), arrive
 * with authentication in step 4.
 */
interface HttpConfiguration {
  readonly kind: typeof ADAPTERS.Http;
}

/** How the app is wired. A discriminated union: add a member, and the compiler lists every switch to extend. */
export type Configuration = MockConfiguration | HttpConfiguration;

/** The configuration used when nothing is said: the mock one, with the values of `config.ts`. */
export function defaultMockConfiguration(): MockConfiguration {
  return { kind: ADAPTERS.Mock, startSignedIn: MOCK_STARTS_SIGNED_IN, latency: SIMULATED_LATENCY };
}

/**
 * Turns the value of the environment variable that selects the adapters into a configuration. It
 * takes the raw value, so it reads nothing itself: the one place that reads the environment is
 * `app/_layout.tsx`. A missing or blank value is the mock configuration, the default. The value is
 * trimmed and its case ignored. Anything else that is not a known way of wiring is an error, not a
 * silent fallback: a typo must not start the demo against the wrong thing.
 */
export function parseAdaptersSetting(
  raw: string | undefined,
): Result<Configuration, ContainerError> {
  const setting = (raw ?? '').trim();
  if (setting === '') return ok(defaultMockConfiguration());

  const adapters = findConstant(valuesOf(ADAPTERS), setting.toLowerCase());
  switch (adapters) {
    case ADAPTERS.Mock:
      return ok(defaultMockConfiguration());
    case ADAPTERS.Http:
      return ok({ kind: ADAPTERS.Http });
    case undefined:
      return err(invalidAdaptersSetting(setting));
  }
}
