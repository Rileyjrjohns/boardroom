import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { ADAPTERS } from './adapters';
import {
  APP_LOCK_GRACE_PERIOD,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
  MEETINGS_PAGE_SIZE,
} from './config';
import { parseConfiguration } from './configuration';
import type {
  BuildEnvironment,
  Configuration,
  HttpConfiguration,
  MockConfiguration,
  RawSettings,
} from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import type { ContainerError } from './errors';
import { createHttpPorts } from './httpPorts';
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
  /**
   * What the demo drives: the connection of the simulated server, off and on. Only the mock
   * configuration has it: a real device has no switch to cut its own network.
   */
  readonly demoControls: MockControls['network'];
}

/** The app wired against the API, SQLite, the secure storage and the device. */
export interface HttpContainer {
  readonly kind: typeof ADAPTERS.Http;
  readonly useCases: UseCases;
  readonly settings: ContainerSettings;
}

/**
 * What the composition root hands over: the use cases, built once, the settings the screens need,
 * and the controls of the configuration (the demo ones exist in the mock configuration only).
 */
export type Container = MockContainer | HttpContainer;

/** The values of `config.ts` that the use cases take, and whether the app starts locked. */
function settingsOfUseCases(startsLocked: boolean): UseCaseSettings {
  return {
    maxCacheAge: MAX_CACHE_AGE,
    maxAttempts: MAX_VOTE_DELIVERY_ATTEMPTS,
    gracePeriod: APP_LOCK_GRACE_PERIOD,
    startsLocked,
  };
}

const SETTINGS: ContainerSettings = { meetingsPageSize: MEETINGS_PAGE_SIZE };

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
    settings: SETTINGS,
    controls: wiring.value.controls,
    demoControls: wiring.value.controls.network,
  });
}

async function createHttpContainer(
  config: HttpConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<HttpContainer, ContainerError>> {
  const ports = await createHttpPorts(config, runtime);
  if (!ports.ok) return ports;

  return ok({
    kind: ADAPTERS.Http,
    // A real start is a cold start: whoever the stored session belongs to unlocks the app first.
    useCases: wireUseCases(ports.value, settingsOfUseCases(true)),
    settings: SETTINGS,
  });
}

/**
 * The composition root: builds the whole object graph for a configuration, with manual typed
 * constructor injection. It is a factory, not a singleton: every call returns an independent
 * container, with its own server, caches and outbox, and the root layout calls it once per app
 * instance. There is no container library and no lookup by name.
 *
 * It is asynchronous because the real configuration has to open its database, which reads the key
 * from the keychain, opens a file and migrates its schema. It answers with a `Result`: a database
 * that cannot be opened is an error to show, not an exception, and the app does not start on
 * another configuration instead.
 */
export function createContainer(
  config: MockConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<MockContainer, ContainerError>>;
export function createContainer(
  config: HttpConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<HttpContainer, ContainerError>>;
export function createContainer(
  config: Configuration,
  runtime: ContainerRuntime,
): Promise<Result<Container, ContainerError>>;
export async function createContainer(
  config: Configuration,
  runtime: ContainerRuntime,
): Promise<Result<Container, ContainerError>> {
  switch (config.kind) {
    case ADAPTERS.Mock:
      return createMockContainer(config, runtime);
    case ADAPTERS.Http:
      return createHttpContainer(config, runtime);
  }
}

/**
 * `createContainer` for the raw settings of the environment (see `parseConfiguration`) and the
 * kind of build: what the root layout calls, with what it read.
 */
export async function startContainer(
  settings: RawSettings,
  environment: BuildEnvironment,
  runtime: ContainerRuntime,
): Promise<Result<Container, ContainerError>> {
  const configuration = parseConfiguration(settings, environment);
  return configuration.ok
    ? createContainer(configuration.value, runtime)
    : err(configuration.error);
}
