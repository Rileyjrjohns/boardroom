import { err, isErr, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { SystemClock } from '@infrastructure/clock/SystemClock';
import { timerSleep } from '@infrastructure/clock/sleep';
import { InMemoryAuthSession } from '@infrastructure/in-memory/InMemoryAuthSession';
import { InMemoryBackend } from '@infrastructure/in-memory/InMemoryBackend';
import { InMemoryBiometricGate } from '@infrastructure/in-memory/InMemoryBiometricGate';
import { InMemoryDocumentCache } from '@infrastructure/in-memory/InMemoryDocumentCache';
import { InMemoryDocumentContent } from '@infrastructure/in-memory/InMemoryDocumentContent';
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
import { ConsoleMonitoring } from '@infrastructure/monitoring/ConsoleMonitoring';

import type { MockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { mockDataInvalid } from './errors';
import type { MockDataInvalidError } from './errors';
import type { Ports } from './Ports';

/** What the app and the tests may drive in the mock configuration. */
export interface MockControls {
  /** Takes the simulated server offline and online, and sets how long it takes to answer. */
  readonly network: NetworkControl;
  /**
   * The screen protection of the simulation: whether it is on, and a way to report a screenshot or
   * a recording to whoever subscribed.
   */
  readonly screenProtection: InMemoryScreenProtection;
}

interface MockWiring {
  readonly ports: Ports;
  readonly controls: MockControls;
}

/**
 * The adapters of the mock configuration, wired to each other: the three remote repositories are
 * windows on one simulated server (`InMemoryBackend`), which learns who is calling from the
 * session store (`InMemoryAuthSession`) and shares its network with it; the caches and the outbox
 * are in memory; the biometrics always succeed and the screen protection records what it is asked.
 * The connectivity is that of the simulated network, so that its offline switch drives the app.
 * The seed is generated from the clock, so there are always upcoming and past meetings.
 */
export function createMockPorts(
  config: MockConfiguration,
  runtime: ContainerRuntime,
): Result<MockWiring, MockDataInvalidError> {
  const clock = runtime.clock ?? new SystemClock();
  const monitoring = runtime.monitoring ?? new ConsoleMonitoring();

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
  const documentContent = new InMemoryDocumentContent();
  const screenProtection = new InMemoryScreenProtection();

  return ok({
    ports: {
      clock,
      monitoring,
      auth,
      biometricGate: new InMemoryBiometricGate(),
      connectivity: new SimulatedConnectivity(backend.network),
      screenProtection,
      meetings: new InMemoryMeetingRepository(backend),
      meetingCache: new InMemoryMeetingCache(),
      documents: new InMemoryDocumentRepository(backend, documentContent),
      documentCache: new InMemoryDocumentCache(documentContent),
      votes: new InMemoryVoteRepository(backend),
      outbox: new InMemoryVoteOutbox(),
    },
    controls: { network: backend.network, screenProtection },
  });
}
