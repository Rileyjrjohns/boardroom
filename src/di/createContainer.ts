import { andThen, err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { ADAPTERS } from './adapters';
import {
  APP_LOCK_GRACE_PERIOD,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
  MEETINGS_PAGE_SIZE,
} from './config';
import { parseAdaptersSetting } from './configuration';
import type { BuildEnvironment, Configuration, MockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { configurationNotAvailable } from './errors';
import type { ContainerError } from './errors';
import { createMockPorts } from './mockPorts';
import type { MockControls } from './mockPorts';
import type { UseCaseSettings } from './Ports';
import { wireUseCases } from './wireUseCases';
import type { UseCases } from './wireUseCases';

/** Values the screens need that come from the configuration (see `config.ts`). */
interface ContainerSettings {
  /** How many meetings a page of the list holds. */
  readonly meetingsPageSize: number;
}

/** The app wired against the in-memory adapters. */
export interface MockContainer {
  readonly kind: typeof ADAPTERS.Mock;
  readonly useCases: UseCases;
  readonly settings: ContainerSettings;
  readonly controls: MockControls;
}

/**
 * What the composition root hands over: the use cases, built once, the settings the screens need,
 * and the controls of the configuration. Today only the mock configuration yields one; the HTTP one
 * joins this union in step 4 and the compiler then points at everything that must handle it.
 */
export type Container = MockContainer;

/** The values of `config.ts` that the use cases take, and whether the app starts locked. */
function settingsOfUseCases(startsLocked: boolean): UseCaseSettings {
  return {
    maxCacheAge: MAX_CACHE_AGE,
    maxAttempts: MAX_VOTE_DELIVERY_ATTEMPTS,
    gracePeriod: APP_LOCK_GRACE_PERIOD,
    startsLocked,
  };
}

function createMockContainer(
  config: MockConfiguration,
  runtime: ContainerRuntime,
): Result<MockContainer, ContainerError> {
  const wiring = createMockPorts(config, runtime);
  if (!wiring.ok) return wiring;

  return ok({
    kind: ADAPTERS.Mock,
    // A session opened by the configuration itself stands for a sign-in the user has just made:
    // it is unlocked. Without one, the app starts locked, as a cold start does.
    useCases: wireUseCases(wiring.value.ports, settingsOfUseCases(!config.startSignedIn)),
    settings: { meetingsPageSize: MEETINGS_PAGE_SIZE },
    controls: wiring.value.controls,
  });
}

/**
 * The composition root: builds the whole object graph for a configuration, with manual typed
 * constructor injection. It is a factory, not a singleton: every call returns an independent
 * container, with its own server, caches and outbox, and the root layout calls it once per app
 * instance. There is no container library and no lookup by name.
 *
 * The HTTP configuration is not available yet and says so with an error. It is never replaced by
 * the mock one: running the demo against the wrong thing without noticing is worse than not
 * starting.
 */
export function createContainer(
  config: Configuration,
  runtime: ContainerRuntime = {},
): Result<Container, ContainerError> {
  switch (config.kind) {
    case ADAPTERS.Mock:
      return createMockContainer(config, runtime);
    case ADAPTERS.Http:
      return err(configurationNotAvailable(config.kind));
  }
}

/**
 * `createContainer` for the raw value of the environment variable that selects the adapters
 * (see `parseAdaptersSetting`) and the kind of build: what the root layout calls, with what it read.
 */
export function startContainer(
  adaptersSetting: string | undefined,
  environment: BuildEnvironment,
  runtime: ContainerRuntime = {},
): Result<Container, ContainerError> {
  return andThen(parseAdaptersSetting(adaptersSetting, environment), (config) =>
    createContainer(config, runtime),
  );
}
