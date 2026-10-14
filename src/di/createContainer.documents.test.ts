import { SCREEN_PROTECTION_ERROR_CODE } from '@domain/errors/ScreenProtectionError';
import { FRESHNESS } from '@application/shared/Loaded';
import { FakeClock } from '@application/testing/FakeClock';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { CONFIDENTIALITY_LEVEL, isConfidential } from '@domain/entities/Document';
import type { Result } from '@domain/shared/Result';
import { aDocument, aDocumentId, aDuration, aMeeting, unwrap } from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import type { FileStore } from '@infrastructure/files/FileStore';
import { DEMO_PASSWORD } from '@infrastructure/in-memory/seed';
import { InMemoryScreenProtection } from '@infrastructure/in-memory/InMemoryScreenProtection';
import { DEMO_PDF_MAX_PAGES } from '@infrastructure/pdf/createDocumentPdf';
import { hasPdfSignature } from '@infrastructure/pdf/pdfSignature';
import type { DevicePlatform } from '@infrastructure/device/DevicePlatform';
import { FakeNetworkState } from '@infrastructure/testing/FakeNetworkState';
import {
  createHttpServerSide,
  installMockApi,
  TEST_API_URL,
} from '@infrastructure/testing/httpWorld';
import { MemorySecureStorage } from '@infrastructure/testing/MemorySecureStorage';
import { nodeRandomBytes } from '@infrastructure/testing/nodeRandomBytes';
import { readStoredFile } from '@infrastructure/testing/NodeFileVolume';
import {
  NodeSqliteOpener,
  freshDirectory,
  nodeFileSystem,
} from '@infrastructure/testing/NodeSqlite';
import { SimulatedCipherOpener } from '@infrastructure/testing/SimulatedCipherOpener';
import { databaseDirectory } from '@infrastructure/testing/testDatabase';
import { testFileStore } from '@infrastructure/testing/testFiles';
import { immediateSleep } from '@infrastructure/testing/sleep';
import { TEST_PASSWORD } from '@infrastructure/testing/testServer';

import { ADAPTERS } from './adapters';
import { MEETINGS_PAGE_SIZE } from './config';
import { defaultMockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { createContainer, startContainer } from './createContainer';
import type { HttpContainer, MockContainer } from './createContainer';

// Documents through the real composition root, in both configurations: the content is a real PDF in
// a file of a directory of the machine, the entries are remembered the way each configuration
// remembers them, and signing out leaves nothing of any document on the device.

const installed = installMockApi();
const databases = databaseDirectory();

const ALICE = 'alice.martin@boardroom.example';

function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Expected a success, got ${JSON.stringify(result.error)}`);
  return result.value;
}

async function names(files: FileStore): Promise<string[]> {
  return [...valueOf(await files.list())].sort();
}

const page = unwrap(createPageRequest({ limit: MEETINGS_PAGE_SIZE }));

/** The ids of the confidential and the public documents of the first upcoming meeting. */
async function documentsOf(container: Pick<MockContainer, 'useCases'>) {
  const listed = valueOf(
    await container.useCases.listMeetings.execute({
      period: MEETING_PERIOD.Upcoming,
      request: page,
    }),
  );
  const first = listed.data.items[0];
  if (first === undefined) throw new Error('There is no meeting.');
  const meeting = valueOf(
    await container.useCases.getMeeting.execute({ meetingId: first.id }),
  ).data;
  const confidential = meeting.documents.find(isConfidential);
  const other = meeting.documents.find((document) => !isConfidential(document));
  if (confidential === undefined || other === undefined) throw new Error('Two kinds are needed.');
  return { confidential, other };
}

describe('createContainer, mock configuration, documents', () => {
  function silentRuntime(overrides: Partial<ContainerRuntime> = {}): ContainerRuntime {
    return {
      clock: new FakeClock(),
      sleep: immediateSleep,
      monitoring: new FakeMonitoring(),
      biometricPromptText: (reason) => ({ message: reason, cancelLabel: 'cancel' }),
      screenProtection: new InMemoryScreenProtection(),
      fileStore: testFileStore(),
      ...overrides,
    };
  }

  async function aContainer(runtime = silentRuntime()): Promise<MockContainer> {
    const created = await createContainer(
      { ...defaultMockConfiguration(), startSignedIn: true, latency: aDuration(0) },
      runtime,
    );
    if (!created.ok) throw new Error(`Not built: ${JSON.stringify(created.error)}`);
    return created.value;
  }

  it('opens a document: its content is a PDF in a file of the device, with the pages of the document', async () => {
    const files = testFileStore();
    const container = await aContainer(silentRuntime({ fileStore: files }));
    const { confidential } = await documentsOf(container);

    const opened = valueOf(
      await container.useCases.openDocument.execute({ documentId: confidential.id }),
    );

    const bytes = readStoredFile(opened.location);
    expect(hasPdfSignature(bytes)).toBe(true);
    expect(String.fromCharCode(...bytes)).toContain(
      `/Count ${Math.min(confidential.pageCount, DEMO_PDF_MAX_PAGES)}`,
    );
    expect(opened.screenProtected).toBe(true);
    expect(await names(files)).toHaveLength(1);
  });

  it('opens it again without the network from the saved copy, on the same file, protected', async () => {
    const files = testFileStore();
    const container = await aContainer(silentRuntime({ fileStore: files }));
    const { confidential } = await documentsOf(container);
    const first = valueOf(
      await container.useCases.openDocument.execute({ documentId: confidential.id }),
    );
    container.demoControls.network.setOnline(false);

    const again = valueOf(
      await container.useCases.openDocument.execute({ documentId: confidential.id }),
    );

    expect(again.source.freshness).toBe(FRESHNESS.Stale);
    expect(again.location).toBe(first.location);
    expect(again.screenProtected).toBe(true);
  });

  it('refuses a document never opened when the network is down', async () => {
    const container = await aContainer();
    const { confidential, other } = await documentsOf(container);
    await container.useCases.openDocument.execute({ documentId: other.id });
    container.demoControls.network.setOnline(false);

    const refused = await container.useCases.openDocument.execute({ documentId: confidential.id });

    expect(!refused.ok && refused.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
  });

  it('turns the screen protection on for a confidential document and off when it is closed', async () => {
    const screenProtection = new InMemoryScreenProtection();
    const container = await aContainer(silentRuntime({ screenProtection }));
    const { confidential, other } = await documentsOf(container);

    await container.useCases.openDocument.execute({ documentId: other.id });
    expect(screenProtection.isEnabled()).toBe(false);
    await container.useCases.openDocument.execute({ documentId: confidential.id });
    expect(screenProtection.isEnabled()).toBe(true);
    await container.useCases.closeDocument.execute({ documentId: confidential.id });

    expect(screenProtection.isEnabled()).toBe(false);
  });

  it('does not show a confidential document when the screen cannot be protected', async () => {
    const screenProtection = new InMemoryScreenProtection();
    screenProtection.failEnableWith({ code: SCREEN_PROTECTION_ERROR_CODE.Failed });
    const container = await aContainer(silentRuntime({ screenProtection }));
    const { confidential } = await documentsOf(container);

    const refused = await container.useCases.openDocument.execute({ documentId: confidential.id });

    expect(!refused.ok && refused.error.code).toBe(SCREEN_PROTECTION_ERROR_CODE.Failed);
  });

  it('leaves nothing of any document on the device once the user signs out', async () => {
    const files = testFileStore();
    const container = await aContainer(silentRuntime({ fileStore: files }));
    const { confidential, other } = await documentsOf(container);
    await container.useCases.openDocument.execute({ documentId: confidential.id });
    await container.useCases.openDocument.execute({ documentId: other.id });
    expect(await names(files)).toHaveLength(2);

    valueOf(await container.useCases.signOut.execute());

    expect(await names(files)).toEqual([]);
    valueOf(await container.useCases.signIn.execute({ email: ALICE, password: DEMO_PASSWORD }));
    container.demoControls.network.setOnline(false);
    const afterwards = await container.useCases.openDocument.execute({ documentId: other.id });
    expect(!afterwards.ok && afterwards.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
  });

  it('deletes what the last run left when it starts, before anything is downloaded', async () => {
    const files = testFileStore();
    valueOf(await files.write('left-by-the-last-run.pdf', Uint8Array.from([1, 2, 3])));

    await aContainer(silentRuntime({ fileStore: files }));

    expect(await names(files)).toEqual([]);
  });

  it('starts, and tells the monitoring, when the files of the last run cannot be deleted', async () => {
    const files = testFileStore();
    const failing: FileStore = {
      ...files,
      deleteAll: () => Promise.resolve({ ok: false, error: { cause: 'EBUSY' } }),
    };
    const monitoring = new FakeMonitoring();

    await aContainer(silentRuntime({ fileStore: failing, monitoring }));

    expect(monitoring.errors).toEqual([
      expect.objectContaining({
        event: 'orphanFileNotDeleted',
        error: { code: 'storageWriteFailed', cause: 'EBUSY' },
        attributes: { resource: 'document' },
      }),
    ]);
  });
});

describe('createContainer, http configuration, documents', () => {
  /** A device that outlives the app: the database, the keychain and the files stay when it restarts. */
  function aDevice() {
    const storage = new MemorySecureStorage();
    const opener = new SimulatedCipherOpener(
      new NodeSqliteOpener(freshDirectory(databases), nodeFileSystem()),
    );
    const networkState = new FakeNetworkState();
    const fileStore = testFileStore();
    const platform: DevicePlatform = {
      databaseOpener: opener,
      secureStorage: storage,
      randomBytes: nodeRandomBytes,
      localAuthentication: {
        hasHardware: () => Promise.resolve(true),
        isEnrolled: () => Promise.resolve(true),
        authenticate: () => Promise.resolve({ success: true }),
      },
      networkState,
    };
    return { platform, fileStore };
  }

  function aWorld() {
    const server = createHttpServerSide(installed);
    server.load({
      meetings: [
        aMeeting({
          documents: [
            aDocument({
              id: aDocumentId('report'),
              title: 'Remuneration report',
              confidentiality: CONFIDENTIALITY_LEVEL.Confidential,
              pageCount: 4,
            }),
            aDocument({
              id: aDocumentId('pack'),
              title: 'Board pack',
              confidentiality: CONFIDENTIALITY_LEVEL.Public,
              pageCount: 2,
            }),
          ],
        }),
      ],
      recordedVotes: [],
    });
    const device = aDevice();
    const monitoring = new FakeMonitoring();

    async function start(overrides: Partial<ContainerRuntime> = {}): Promise<HttpContainer> {
      const started = await startContainer(
        { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
        { development: true },
        {
          clock: server.clock,
          monitoring,
          platform: device.platform,
          fileStore: device.fileStore,
          screenProtection: new InMemoryScreenProtection(),
          biometricPromptText: (reason) => ({ message: reason, cancelLabel: 'cancel' }),
          ...overrides,
        },
      );
      if (!started.ok || started.value.kind !== ADAPTERS.Http) {
        throw new Error(`Not built: ${JSON.stringify(started)}`);
      }
      return started.value;
    }

    const [alice] = server.accounts;
    if (alice === undefined) throw new Error('The test server has no account.');
    return {
      server,
      device,
      monitoring,
      start,
      credentials: { email: alice.user.email, password: TEST_PASSWORD },
    };
  }

  const REPORT = aDocumentId('report');
  const PACK = aDocumentId('pack');

  it('downloads the PDF to a file of the device, and remembers the document in the database', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));

    const opened = valueOf(await container.useCases.openDocument.execute({ documentId: REPORT }));

    expect(opened.source.freshness).toBe(FRESHNESS.Fresh);
    expect(String.fromCharCode(...readStoredFile(opened.location))).toContain('/Count 4');
    expect(await names(device.fileStore)).toHaveLength(1);
  });

  it('opens the document again after a restart, without the network, from the database and the file', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    const first = valueOf(await container.useCases.openDocument.execute({ documentId: REPORT }));
    installed.conditions.online = false;

    const restarted = await start();
    valueOf(await restarted.useCases.unlockApp.execute());
    const again = valueOf(await restarted.useCases.openDocument.execute({ documentId: REPORT }));

    expect(again.source.freshness).toBe(FRESHNESS.Stale);
    expect(again.location).toBe(first.location);
    expect(again.document).toEqual(first.document);
    expect(await names(device.fileStore)).toHaveLength(1);
  });

  it('refuses a document never opened while offline, and one the cache lost the file of', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    await container.useCases.openDocument.execute({ documentId: REPORT });
    installed.conditions.online = false;

    const neverOpened = await container.useCases.openDocument.execute({ documentId: PACK });
    // The system emptied the caches while the app was away.
    valueOf(await device.fileStore.deleteAll());
    const lost = await container.useCases.openDocument.execute({ documentId: REPORT });

    expect(!neverOpened.ok && neverOpened.error.code).toBe(
      REPOSITORY_ERROR_CODE.NetworkUnavailable,
    );
    expect(!lost.ok && lost.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
  });

  it('leaves nothing of any document on the device once the user signs out', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    await container.useCases.openDocument.execute({ documentId: REPORT });
    await container.useCases.openDocument.execute({ documentId: PACK });
    expect(await names(device.fileStore)).toHaveLength(2);

    valueOf(await container.useCases.signOut.execute());

    expect(await names(device.fileStore)).toEqual([]);
  });

  it('deletes the files of a session the server refuses, and the saved copies with them', async () => {
    const { start, device, credentials, server } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    await container.useCases.openDocument.execute({ documentId: REPORT });

    // The server forgets the token: the next request is refused, which ends the session.
    server.api.revokeSessions();
    const refused = await container.useCases.openDocument.execute({ documentId: PACK });

    expect(!refused.ok && refused.error.code).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
    expect(await names(device.fileStore)).toEqual([]);
  });

  it('deletes the files no entry points at when it starts, and keeps the ones an entry does', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    const opened = valueOf(await container.useCases.openDocument.execute({ documentId: REPORT }));
    valueOf(await device.fileStore.write('stray.pdf', Uint8Array.from([1])));

    const restarted = await start();

    expect(await names(device.fileStore)).toEqual([device.fileStore.nameOf(opened.location)]);
    expect(restarted.kind).toBe(ADAPTERS.Http);
  });
});
