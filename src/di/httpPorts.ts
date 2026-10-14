import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { DeviceBiometricGate } from '@infrastructure/biometrics/DeviceBiometricGate';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { SystemClock } from '@infrastructure/clock/SystemClock';
import { ExpoConnectivity } from '@infrastructure/connectivity/ExpoConnectivity';
import { createExpoFileStore } from '@infrastructure/files/createExpoFileStore';
import { createExpoPlatform } from '@infrastructure/device/createExpoPlatform';
import { HttpAuthSession } from '@infrastructure/http/HttpAuthSession';
import { HttpClient } from '@infrastructure/http/HttpClient';
import { HttpDocumentRepository } from '@infrastructure/http/HttpDocumentRepository';
import { HttpMeetingRepository } from '@infrastructure/http/HttpMeetingRepository';
import { HttpVoteRepository } from '@infrastructure/http/HttpVoteRepository';
import { ConsoleMonitoring } from '@infrastructure/monitoring/ConsoleMonitoring';
import { NativeScreenProtection } from '@infrastructure/native/NativeScreenProtection';
import { readLocalDataResetNotice } from '@infrastructure/persistence/localDataReset';
import { MIGRATIONS } from '@infrastructure/persistence/migrations';
import { openProtectedDatabase } from '@infrastructure/persistence/protectedDatabase';
import { SqliteDocumentCache } from '@infrastructure/persistence/SqliteDocumentCache';
import { SqliteMeetingCache } from '@infrastructure/persistence/SqliteMeetingCache';
import { SqliteVoteOutbox } from '@infrastructure/persistence/SqliteVoteOutbox';
import { SessionVault } from '@infrastructure/secure-storage/SessionVault';

import { DATABASE_NAME, DOCUMENT_DOWNLOAD_TIMEOUT } from './config';
import type { HttpConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { storageUnavailable } from './errors';
import type { StorageUnavailableError } from './errors';
import type { Ports } from './Ports';
import type { StartupNotices } from './startupNotices';

/** What the files of the documents are called in the logs. */
const DOCUMENTS_RESOURCE = 'document';

/** What the http configuration is built from: the ports, and what the user is to be told. */
export interface HttpWiring {
  readonly ports: Ports;
  readonly notices: StartupNotices;
}

/**
 * The adapters of the http configuration, wired to each other:
 *
 * - the three remote repositories and the sign-in talk to the API through one `HttpClient`, which
 *   reads the token of the signed-in user from the `SessionVault` (the secure storage of the
 *   device) when it creates each request;
 * - the cache of meetings and the outbox of votes live in one local database, encrypted with a key
 *   that only the secure storage holds (`openProtectedDatabase`). Opening it is asynchronous and
 *   can fail, which is why the container is built asynchronously;
 * - when opening the database had to set an unreadable one aside (`openProtectedDatabase`), the
 *   notice that the user is owed is read from the secure storage and handed over with the ports;
 * - the biometrics are those of the device, and the connectivity that of `expo-network`;
 * - the key of the database is drawn from the secure random generator of the device
 *   (`platform.randomBytes`, `expo-crypto`);
 * - the screen protection is the native module of the app, over `NativeScreenProtection`, unless
 *   the runtime hands over another one;
 * - the cache of documents is in the same database for the metadata and in files of the device for
 *   the content, which the repository downloads to (README, "Persistence" and "Documents and
 *   watermark"); the files no entry points at are deleted when it starts.
 */
export async function createHttpPorts(
  config: HttpConfiguration,
  runtime: ContainerRuntime,
): Promise<Result<HttpWiring, StorageUnavailableError>> {
  const clock = runtime.clock ?? new SystemClock();
  const monitoring = runtime.monitoring ?? new ConsoleMonitoring();
  const platform = runtime.platform ?? createExpoPlatform();

  const database = await openProtectedDatabase({
    opener: platform.databaseOpener,
    storage: platform.secureStorage,
    randomBytes: platform.randomBytes,
    monitoring,
    name: DATABASE_NAME,
    migrations: MIGRATIONS,
  });
  if (!database.ok) return err(storageUnavailable(database.error.reason));

  const reset = await readLocalDataResetNotice(platform.secureStorage, monitoring);

  const vault = new SessionVault({ storage: platform.secureStorage, monitoring });
  const client = new HttpClient({
    baseUrl: config.baseUrl,
    timeout: config.requestTimeout,
    tokens: vault,
    monitoring,
  });
  const files = runtime.fileStore ?? createExpoFileStore();
  const documentCache = new SqliteDocumentCache({ database: database.value, files, monitoring });
  // The files that no entry points at (a download whose entry was never saved, a file that was
  // being written when the app stopped) are deleted before anything can be downloaded. A file that
  // cannot be deleted is reported by the cache, and left for the next start.
  const swept = await documentCache.sweepOrphans();
  if (!swept.ok) {
    monitoring.captureError(MONITORING_EVENT.CacheRemoveFailed, swept.error, {
      [LOG_ATTRIBUTE.Resource]: DOCUMENTS_RESOURCE,
    });
  }

  const ports: Ports = {
    clock,
    monitoring,
    auth: new HttpAuthSession({ client, vault, clock, monitoring }),
    biometricGate: new DeviceBiometricGate({
      api: platform.localAuthentication,
      promptText: runtime.biometricPromptText,
      monitoring,
      allowDevicePasscode: config.allowDevicePasscode,
    }),
    connectivity: new ExpoConnectivity({ api: platform.networkState, monitoring }),
    // A build without the native module cannot protect a screen, and the adapter says so: a
    // confidential document is then not shown, which is the safe way to fail.
    screenProtection:
      runtime.screenProtection ??
      new NativeScreenProtection({ module: platform.screenProtectionModule, monitoring }),
    meetings: new HttpMeetingRepository(client, monitoring),
    meetingCache: new SqliteMeetingCache({ database: database.value, monitoring }),
    documents: new HttpDocumentRepository(client, monitoring, files, {
      downloadTimeout: DOCUMENT_DOWNLOAD_TIMEOUT,
    }),
    documentCache,
    votes: new HttpVoteRepository(client, monitoring),
    outbox: new SqliteVoteOutbox({ database: database.value, monitoring }),
  };
  return ok({
    ports,
    notices: {
      localDataReset: reset.pending,
      acknowledgeLocalDataReset: reset.acknowledge,
    },
  });
}
