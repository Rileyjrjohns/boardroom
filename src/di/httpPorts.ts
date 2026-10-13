import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { DeviceBiometricGate } from '@infrastructure/biometrics/DeviceBiometricGate';
import { SystemClock } from '@infrastructure/clock/SystemClock';
import { ExpoConnectivity } from '@infrastructure/connectivity/ExpoConnectivity';
import { createExpoPlatform } from '@infrastructure/device/createExpoPlatform';
import { HttpAuthSession } from '@infrastructure/http/HttpAuthSession';
import { HttpClient } from '@infrastructure/http/HttpClient';
import { HttpDocumentRepository } from '@infrastructure/http/HttpDocumentRepository';
import { HttpMeetingRepository } from '@infrastructure/http/HttpMeetingRepository';
import { HttpVoteRepository } from '@infrastructure/http/HttpVoteRepository';
import { InMemoryDocumentCache } from '@infrastructure/in-memory/InMemoryDocumentCache';
import { InMemoryDocumentContent } from '@infrastructure/in-memory/InMemoryDocumentContent';
import { InMemoryScreenProtection } from '@infrastructure/in-memory/InMemoryScreenProtection';
import { ConsoleMonitoring } from '@infrastructure/monitoring/ConsoleMonitoring';
import { MIGRATIONS } from '@infrastructure/persistence/migrations';
import { openProtectedDatabase } from '@infrastructure/persistence/protectedDatabase';
import { SqliteMeetingCache } from '@infrastructure/persistence/SqliteMeetingCache';
import { SqliteVoteOutbox } from '@infrastructure/persistence/SqliteVoteOutbox';
import { SessionVault } from '@infrastructure/secure-storage/SessionVault';

import { DATABASE_NAME } from './config';
import type { HttpConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { storageUnavailable } from './errors';
import type { StorageUnavailableError } from './errors';
import type { Ports } from './Ports';

/**
 * The adapters of the http configuration, wired to each other:
 *
 * - the three remote repositories and the sign-in talk to the API through one `HttpClient`, which
 *   reads the token of the signed-in user from the `SessionVault` (the secure storage of the
 *   device) when it creates each request;
 * - the cache of meetings and the outbox of votes live in one local database, encrypted with a key
 *   that only the secure storage holds (`openProtectedDatabase`). Opening it is asynchronous and
 *   can fail, which is why the container is built asynchronously;
 * - the biometrics are those of the device, and the connectivity that of `expo-network`;
 * - the cache of documents stays in memory until the step that stores their content decides how
 *   (README, "Persistence"), and so does the screen protection until the native module step.
 */
export async function createHttpPorts(
  config: HttpConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<Ports, StorageUnavailableError>> {
  const clock = runtime.clock ?? new SystemClock();
  const monitoring = runtime.monitoring ?? new ConsoleMonitoring();
  const platform = runtime.platform ?? createExpoPlatform();

  const database = await openProtectedDatabase({
    opener: platform.databaseOpener,
    storage: platform.secureStorage,
    monitoring,
    name: DATABASE_NAME,
    migrations: MIGRATIONS,
  });
  if (!database.ok) return err(storageUnavailable(database.error.reason));

  const vault = new SessionVault({ storage: platform.secureStorage, monitoring });
  const client = new HttpClient({
    baseUrl: config.baseUrl,
    timeout: config.requestTimeout,
    tokens: vault,
    monitoring,
  });
  const documentContent = new InMemoryDocumentContent();

  return ok({
    clock,
    monitoring,
    auth: new HttpAuthSession({ client, vault, clock, monitoring }),
    biometricGate: new DeviceBiometricGate({
      api: platform.localAuthentication,
      promptText: runtime.biometricPromptText,
      allowDevicePasscode: config.allowDevicePasscode,
    }),
    connectivity: new ExpoConnectivity({ api: platform.networkState }),
    screenProtection: new InMemoryScreenProtection(),
    meetings: new HttpMeetingRepository(client, monitoring),
    meetingCache: new SqliteMeetingCache({ database: database.value, monitoring }),
    documents: new HttpDocumentRepository(client, monitoring, documentContent),
    documentCache: new InMemoryDocumentCache(documentContent),
    votes: new HttpVoteRepository(client, monitoring),
    outbox: new SqliteVoteOutbox({ database: database.value, monitoring }),
  });
}
