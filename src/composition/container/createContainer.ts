import type { Clock } from '@core/application/ports/Clock';
import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

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
import { platformUnavailable } from './errors';
import type { ContainerError } from './errors';
import { createHttpPorts } from './httpPorts';
import { createMockPorts } from './mockPorts';
import type { DemoAccountHint, MockControls } from './mockPorts';
import type { UseCaseSettings } from './Ports';
import { NO_STARTUP_NOTICES } from './startupNotices';
import type { StartupNotices } from './startupNotices';
import { wireUseCases } from './wireUseCases';
import type { UseCases } from './wireUseCases';

/** Values the screens need that come from the configuration (see `config.ts`). */
interface ContainerSettings {
  /** How many meetings a page of the list holds. */
  readonly meetingsPageSize: number;
}

/**
 * What the demo drives in the mock configuration: the connection of the simulated server, off and
 * on, and the accounts of the simulation, so that the sign-in screen can offer them. A real device
 * has no switch to cut its own network and no account to hand out, so the http configuration has
 * none of it.
 */
export interface DemoControls {
  readonly network: MockControls['network'];
  readonly accounts: readonly DemoAccountHint[];
}

/** The app wired against the in-memory adapters. */
export interface MockContainer {
  readonly kind: typeof ADAPTERS.Mock;
  readonly useCases: UseCases;
  readonly settings: ContainerSettings;
  /** The clock the use cases read, for the screen that has to record an instant (the background). */
  readonly clock: Clock;
  readonly controls: MockControls;
  readonly demoControls: DemoControls;
  readonly notices: StartupNotices;
}

/** The app wired against the API, SQLite, the secure storage and the device. */
export interface HttpContainer {
  readonly kind: typeof ADAPTERS.Http;
  readonly useCases: UseCases;
  readonly settings: ContainerSettings;
  /** The clock the use cases read, for the screen that has to record an instant (the background). */
  readonly clock: Clock;
  /** What the user is owed an explanation of at the start. */
  readonly notices: StartupNotices;
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

async function createMockContainer(
  config: MockConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<MockContainer, ContainerError>> {
  const wiring = await createMockPorts(config, runtime);
  if (!wiring.ok) return wiring;

  return ok({
    kind: ADAPTERS.Mock,
    // A session opened by the configuration itself stands for a sign-in the user has just made:
    // it is unlocked. Without one, the app starts locked, as a cold start does.
    useCases: wireUseCases(wiring.value.ports, settingsOfUseCases(!config.startSignedIn)),
    settings: SETTINGS,
    clock: wiring.value.ports.clock,
    controls: wiring.value.controls,
    demoControls: { network: wiring.value.controls.network, accounts: wiring.value.demoAccounts },
    notices: NO_STARTUP_NOTICES,
  });
}

async function createHttpContainer(
  config: HttpConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<HttpContainer, ContainerError>> {
  const wiring = await createHttpPorts(config, runtime);
  if (!wiring.ok) return wiring;

  return ok({
    kind: ADAPTERS.Http,
    // A real start is a cold start: whoever the stored session belongs to unlocks the app first.
    useCases: wireUseCases(wiring.value.ports, settingsOfUseCases(true)),
    settings: SETTINGS,
    clock: wiring.value.ports.clock,
    notices: wiring.value.notices,
  });
}

/**
 * The composition root: builds the whole object graph for a configuration, with manual typed
 * constructor injection. It is a factory, not a singleton: every call returns an independent
 * container, with its own server, caches and outbox, and the root layout calls it once per app
 * instance. There is no container library and no lookup by name.
 *
 * It is asynchronous because the real configuration has to open its database, which reads the key
 * from the keychain, opens a file and migrates its schema. It answers with a `Result`, and never
 * rejects: a database that cannot be opened is an error to show, not an exception, and so is a
 * native module of the device that fails (`platformUnavailable`). The app does not start on
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
  try {
    switch (config.kind) {
      case ADAPTERS.Mock:
        return await createMockContainer(config, runtime);
      case ADAPTERS.Http:
        return await createHttpContainer(config, runtime);
    }
  } catch {
    // The ports of the device and of the network promise not to throw, but the modules under them
    // are native code that can fail to load or to start. What was thrown says nothing safe to keep.
    return err(platformUnavailable());
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
