import { InMemoryAuthSession } from '@composition/dev/in-memory/InMemoryAuthSession';
import { InMemoryBackend } from '@composition/dev/in-memory/InMemoryBackend';
import { InMemoryBiometricGate } from '@composition/dev/in-memory/InMemoryBiometricGate';
import { InMemoryDocumentRepository } from '@composition/dev/in-memory/InMemoryDocumentRepository';
import { InMemoryMeetingRepository } from '@composition/dev/in-memory/InMemoryMeetingRepository';
import { InMemoryVoteRepository } from '@composition/dev/in-memory/InMemoryVoteRepository';
import { SimulatedConnectivity } from '@composition/dev/in-memory/SimulatedConnectivity';
import { SimulatedNetwork } from '@composition/dev/in-memory/SimulatedNetwork';
import type { NetworkControl } from '@composition/dev/in-memory/SimulatedNetwork';
import { buildSeed } from '@composition/dev/in-memory/seed';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import type { Monitoring } from '@core/application/ports/Monitoring';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, isErr, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { SystemClock } from '@core/infrastructure/clock/SystemClock';
import { timerSleep } from '@core/infrastructure/clock/sleep';
import { createExpoFileStore } from '@core/infrastructure/files/createExpoFileStore';
import type { BiometricGate } from '@features/auth/application/ports/BiometricGate';
import { DeviceBiometricGate } from '@features/auth/infrastructure/biometrics/DeviceBiometricGate';
import { ExpoLocalAuthentication } from '@features/auth/infrastructure/biometrics/ExpoLocalAuthentication';
import type { ScreenProtection } from '@features/documents/application/ports/ScreenProtection';
import { InMemoryDocumentCache } from '@features/documents/infrastructure/InMemoryDocumentCache';
import { InMemoryScreenProtection } from '@features/documents/infrastructure/InMemoryScreenProtection';
import { NativeScreenProtection } from '@features/documents/infrastructure/native/NativeScreenProtection';
import { loadScreenProtectionModule } from '@features/documents/infrastructure/native/loadScreenProtectionModule';
import { InMemoryMeetingCache } from '@features/meetings/infrastructure/InMemoryMeetingCache';
import { InMemoryVoteOutbox } from '@features/votes/infrastructure/InMemoryVoteOutbox';

import { ALLOW_DEVICE_PASSCODE_FALLBACK } from './config';
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
 * way the http configuration does). The connectivity is that of the simulated network, so that its
 * offline switch drives the app. The seed is not generated: it is
 * loaded from the frozen fixtures of docs/spec/fixtures, with every date shifted by whole days to
 * the clock (see `buildSeed`), so there are always upcoming and past meetings.
 *
 * The biometrics are a concern of the device too: on a phone or a simulator where a finger or a
 * face is enrolled they are the device's, so that the lock screen and the confirmation of a vote
 * show the system prompt (see `chooseBiometricGate`). Where none can be used, the simulation
 * recognises the user, so that the demo runs anyway.
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
  const biometricGate = await chooseBiometricGate(runtime, monitoring);

  return ok({
    ports: {
      clock,
      monitoring,
      auth,
      biometricGate,
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

/**
 * The biometrics of the mock configuration: the device's when it can use them, else the simulation.
 * The device's gate is built as the http configuration builds it (the local authentication of the
 * platform, the text of the prompt, the passcode setting) and asked once, now, whether biometrics
 * can be used: hardware, and a finger or a face enrolled. If so, it is the one in use and every
 * unlock and every vote confirmation shows the system prompt. If not (no hardware, nothing
 * enrolled, no module in the build, no answer in time), the simulation is used, which always
 * recognises the user, so that a simulator without enrolment still runs the demo. The answer is
 * read once per container: enrolling later takes effect at the next start.
 */
async function chooseBiometricGate(
  runtime: ContainerRuntime,
  monitoring: Monitoring,
): Promise<BiometricGate> {
  const device = new DeviceBiometricGate({
    api: runtime.platform?.localAuthentication ?? new ExpoLocalAuthentication(),
    promptText: runtime.biometricPromptText,
    monitoring,
    allowDevicePasscode: ALLOW_DEVICE_PASSCODE_FALLBACK,
  });
  const availability = await device.checkAvailability();
  return availability.ok ? device : new InMemoryBiometricGate();
}
