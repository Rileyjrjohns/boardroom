import { findConstant, valuesOf } from '@domain/shared/constants';
import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import type { Duration } from '@domain/value-objects/Duration';

import { ADAPTERS } from './adapters';
import { MOCK_SESSION_LIFETIME, MOCK_STARTS_SIGNED_IN, SIMULATED_LATENCY } from './config';
import { invalidAdaptersSetting, missingAdaptersSetting } from './errors';
import type { ContainerError } from './errors';

/** The app against the simulated server and the in-memory adapters. */
export interface MockConfiguration {
  readonly kind: typeof ADAPTERS.Mock;
  /** Whether the demo user is signed in at start. Named, so that the day it goes away is visible. */
  readonly startSignedIn: boolean;
  /** How long the simulated server takes to answer. */
  readonly latency: Duration;
  /** How long a session of the simulated server lasts, from the sign-in. */
  readonly sessionLifetime: Duration;
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
  return {
    kind: ADAPTERS.Mock,
    startSignedIn: MOCK_STARTS_SIGNED_IN,
    latency: SIMULATED_LATENCY,
    sessionLifetime: MOCK_SESSION_LIFETIME,
  };
}

/** What the composition root is told about the build it runs in. */
export interface BuildEnvironment {
  /**
   * Whether this is a development build. Told by the root layout, which reads it from the
   * platform: the composition root reads nothing itself.
   */
  readonly development: boolean;
}

/**
 * Turns the value of the environment variable that selects the adapters into a configuration. It
 * takes the raw value, so it reads nothing itself: the one place that reads the environment is
 * `app/_layout.tsx`. A missing or blank value is the mock configuration in a development build,
 * where the simulated server is the sensible default, and an error everywhere else
 * (`missingAdaptersSetting`): a release build must be told what it talks to, and must not start
 * on a simulated server because someone forgot a variable. The value is trimmed and its case
 * ignored. Anything else that is not a known way of wiring is an error, not a silent fallback: a
 * typo must not start the demo against the wrong thing.
 */
export function parseAdaptersSetting(
  raw: string | undefined,
  environment: BuildEnvironment,
): Result<Configuration, ContainerError> {
  const setting = (raw ?? '').trim();
  if (setting === '') {
    return environment.development ? ok(defaultMockConfiguration()) : err(missingAdaptersSetting());
  }

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
