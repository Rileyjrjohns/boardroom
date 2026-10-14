import { storageWriteFailed } from '@domain/errors/StorageError';
import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import type { Monitoring } from '@application/ports/Monitoring';
import type { ScreenProtection } from '@application/ports/ScreenProtection';
import { SystemClock } from '@infrastructure/clock/SystemClock';
import { timerSleep } from '@infrastructure/clock/sleep';
import { createExpoFileStore } from '@infrastructure/files/createExpoFileStore';
import { InMemoryAuthSession } from '@infrastructure/in-memory/InMemoryAuthSession';
import { InMemoryBackend } from '@infrastructure/in-memory/InMemoryBackend';
import { InMemoryBiometricGate } from '@infrastructure/in-memory/InMemoryBiometricGate';
import { InMemoryDocumentCache } from '@infrastructure/in-memory/InMemoryDocumentCache';
import { InMemoryDocumentRepository } from '@infrastructure/in-memory/InMemoryDocumentRepository';
import { InMemoryMeetingCache } from '@infrastructure/in-memory/InMemoryMeetingCache';
import { InMemoryMeetingRepository } from '@infrastructure/in-memory/InMemoryMeetingRepository';
import { InMemoryScreenProtection } from '@infrastructure/in-memory/InMemoryScreenProtection';
import { InMemoryVoteOutbox } from '@infrastructure/in-memory/InMemoryVoteOutbox';
import { InMemoryVoteRepository } from '@infrastructure/in-memory/InMemoryVoteRepository';
import { buildSeed } from '@infrastructure/in-memory/seed';
import { SimulatedNetwork } from '@infrastructure/in-memory/SimulatedNetwork';
import type { NetworkControl } from '@infrastructure/in-memory/SimulatedNetwork';
import { SimulatedConnectivity } from '@infrastructure/connectivity/SimulatedConnectivity';
import { loadScreenProtectionModule } from '@infrastructure/native/loadScreenProtectionModule';
import { NativeScreenProtection } from '@infrastructure/native/NativeScreenProtection';

import type { MockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { createMonitoring } from './createMonitoring';
import { mockDataInvalid } from './errors';
import type { MockDataInvalidError } from './errors';
import type { Ports } from './Ports';

/** What the files of the documents are called in the logs. */
const DOCUMENTS_RESOURCE = 'document';

/** What the app and the tests may drive in the mock configuration. */
export interface MockControls {
  /** Takes the simulated server offline and online, and sets how long it takes to answer. */
  readonly network: NetworkControl;
  /**
   * The screen protection of the simulation: whether it is on, and a way to report a screenshot or
   * a recording to whoever subscribed. Absent when the screen protection is not the simulation: the
   * device's, on a build that has the native module (see `ContainerRuntime.screenProtection`).
   */
  readonly screenProtection: InMemoryScreenProtection | undefined;
}

/**
 * An account of the simulated server, as the sign-in screen of the demo offers it: the demo
 * password protects nothing, the accounts exist only in the simulation.
 */
export interface DemoAccountHint {
  readonly fullName: string;
  readonly email: string;
  readonly password: string;
}

interface MockWiring {
  readonly ports: Ports;
  readonly controls: MockControls;
  readonly demoAccounts: readonly DemoAccountHint[];
}

/**
 * The adapters of the mock configuration, wired to each other: the three remote repositories are
 * windows on one simulated server (`InMemoryBackend`), which learns who is calling from the
 * session store (`InMemoryAuthSession`) and shares its network with it; the caches and the outbox
 * are in memory (the documents' content is in files of the device, written by the repository the
 * way the http configuration does); the biometrics always succeed. The connectivity is that of the simulated network,
 * so that its offline switch drives the app. The seed is generated from the clock, so there are
 * always upcoming and past meetings.
 *
 * The screen protection is a concern of the device, not of the backend that is simulated: on a
 * build that has the native module it is the device's, as in the http configuration. Only without
 * the module (Jest, a development client made before it existed) is it the simulation, which
 * records what it is asked and can be made to report a capture.
 */
export async function createMockPorts(
  config: MockConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<MockWiring, MockDataInvalidError>> {
  const clock = runtime.clock ?? new SystemClock();
  const monitoring = runtime.monitoring ?? createMonitoring(config.sentryDsn, runtime.sentrySdk);

  const seed = buildSeed(clock.now());
  if (isErr(seed)) return err(mockDataInvalid(seed.error.detail));

  const network = new SimulatedNetwork({
    sleep: runtime.sleep ?? timerSleep,
    latency: config.latency,
  });
  const auth = new InMemoryAuthSession({
    clock,
    network,
    accounts: seed.value.accounts,
    sessionLifetime: config.sessionLifetime,
  });
  if (config.startSignedIn) {
    const opened = auth.openSessionFor(seed.value.demoUser);
    if (isErr(opened)) return err(mockDataInvalid(JSON.stringify(opened.error)));
  }

  const created = InMemoryBackend.create({ clock, auth, network, content: seed.value.content });
  if (isErr(created)) return err(mockDataInvalid(JSON.stringify(created.error)));
  const backend = created.value;
  const files = runtime.fileStore ?? createExpoFileStore();
  // The documents already viewed are remembered in memory in this configuration, and forgotten when
  // the app stops; their files are not. Whatever the last run left is deleted before anything can be
  // downloaded, so that no content stays on the device with nothing pointing at it.
  const swept = await files.deleteAll();
  if (!swept.ok) {
    monitoring.captureError(
      MONITORING_EVENT.OrphanFileNotDeleted,
      storageWriteFailed(swept.error.cause),
      { [LOG_ATTRIBUTE.Resource]: DOCUMENTS_RESOURCE },
    );
  }
  const screenProtection = chooseScreenProtection(runtime, monitoring);

  return ok({
    ports: {
      clock,
      monitoring,
      auth,
      biometricGate: new InMemoryBiometricGate(),
      connectivity: new SimulatedConnectivity(backend.network),
      screenProtection: screenProtection.port,
      meetings: new InMemoryMeetingRepository(backend),
      meetingCache: new InMemoryMeetingCache(),
      documents: new InMemoryDocumentRepository(backend, files, monitoring),
      documentCache: new InMemoryDocumentCache(files),
      votes: new InMemoryVoteRepository(backend),
      outbox: new InMemoryVoteOutbox(),
    },
    controls: { network: backend.network, screenProtection: screenProtection.simulation },
    demoAccounts: seed.value.accounts.map(({ user, password }) => ({
      fullName: user.fullName,
      email: user.email,
      password,
    })),
  });
}

/**
 * The screen protection of the mock configuration: the one the runtime hands over, else the
 * device's when the build has the native module, else the simulation. `simulation` is set only when
 * the simulation is the one in use.
 */
function chooseScreenProtection(
  runtime: ContainerRuntime,
  monitoring: Monitoring,
): { readonly port: ScreenProtection; readonly simulation: InMemoryScreenProtection | undefined } {
  if (runtime.screenProtection !== undefined) {
    const handed = runtime.screenProtection;
    return {
      port: handed,
      simulation: handed instanceof InMemoryScreenProtection ? handed : undefined,
    };
  }
  // Only the module is looked for, not the whole platform: the mock configuration needs no other
  // native module.
  const module =
    runtime.platform === undefined
      ? loadScreenProtectionModule()
      : runtime.platform.screenProtectionModule;
  if (module !== undefined)
    return { port: new NativeScreenProtection({ module, monitoring }), simulation: undefined };

  const simulation = new InMemoryScreenProtection();
  return { port: simulation, simulation };
}
