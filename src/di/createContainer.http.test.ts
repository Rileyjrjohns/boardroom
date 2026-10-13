import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import type { ConnectivityStatus } from '@application/ports/Connectivity';
import { FRESHNESS } from '@application/shared/Loaded';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { SESSION_RESTORE } from '@application/use-cases/auth/RestoreSession';
import { CAST_VOTE_STATUS } from '@application/use-cases/votes/CastVote';
import { SYNC_OUTCOME } from '@application/use-cases/votes/SyncPendingVotes';
import { BIOMETRIC_REASON } from '@application/ports/BiometricGate';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import type { Result } from '@domain/shared/Result';
import { aMeetingId, aResolutionId, unwrap } from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { DevicePlatform } from '@infrastructure/device/DevicePlatform';
import { OPEN_FAILURE } from '@infrastructure/persistence/DatabaseOpener';
import { DATABASE_FAILURE } from '@infrastructure/persistence/protectedDatabase';
import { SECURE_STORAGE_KEY } from '@infrastructure/secure-storage/SecureStorage';
import { FakeNetworkState } from '@infrastructure/testing/FakeNetworkState';
import {
  createHttpServerSide,
  installMockApi,
  TEST_API_URL,
} from '@infrastructure/testing/httpWorld';
import { MemorySecureStorage } from '@infrastructure/testing/MemorySecureStorage';
import {
  NodeSqliteOpener,
  freshDirectory,
  nodeFileSystem,
} from '@infrastructure/testing/NodeSqlite';
import { SimulatedCipherOpener } from '@infrastructure/testing/SimulatedCipherOpener';
import { databaseDirectory } from '@infrastructure/testing/testDatabase';
import { TEST_PASSWORD } from '@infrastructure/testing/testServer';

import { ADAPTERS } from './adapters';
import type { ContainerRuntime } from './ContainerRuntime';
import { startContainer } from './createContainer';
import type { HttpContainer } from './createContainer';
import { CONTAINER_ERROR_CODE } from './errors';

// The http configuration, end to end: the real container, wired to the real HTTP adapters, the real
// SQLite adapters over Node's SQLite, the secure storage in memory, the biometrics and the network
// of the device scripted, and the simulated server behind MSW. Nothing is replaced under the use
// cases but the device and the network.

const installed = installMockApi();
const directory = databaseDirectory();
const { Online, Offline } = CONNECTIVITY_STATUS;

/** A device that outlives the app: the keychain, the files and the network state stay when it restarts. */
function aDevice() {
  const storage = new MemorySecureStorage();
  const opener = new SimulatedCipherOpener(
    new NodeSqliteOpener(freshDirectory(directory), nodeFileSystem()),
  );
  const networkState = new FakeNetworkState();
  const biometrics = {
    hardware: true,
    enrolled: true,
    prompts: [] as string[],
    outcome: { success: true } as
      { success: true } | { success: false; error: 'user_cancel' | 'lockout' },
  };
  const platform: DevicePlatform = {
    databaseOpener: opener,
    secureStorage: storage,
    localAuthentication: {
      hasHardware: () => Promise.resolve(biometrics.hardware),
      isEnrolled: () => Promise.resolve(biometrics.enrolled),
      authenticate: ({ promptMessage }) => {
        biometrics.prompts.push(promptMessage);
        return Promise.resolve(biometrics.outcome);
      },
    },
    networkState,
  };
  return { storage, opener, networkState, biometrics, platform };
}

type Device = ReturnType<typeof aDevice>;

/** The server, and a way to start the app on a device, any number of times. */
function aWorld() {
  const server = createHttpServerSide(installed);
  const device = aDevice();
  const monitoring = new FakeMonitoring();
  const [alice] = server.accounts;
  if (alice === undefined) throw new Error('The test server has no account.');

  async function start(on: Device = device, overrides: Partial<ContainerRuntime> = {}) {
    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      {
        clock: server.clock,
        monitoring,
        platform: on.platform,
        biometricPromptText: (reason) => `prompt:${reason}`,
        ...overrides,
      },
    );
    if (!started.ok) {
      throw new Error(`The container was not built: ${JSON.stringify(started.error)}`);
    }
    if (started.value.kind !== ADAPTERS.Http) throw new Error('Expected the http container.');
    return started.value;
  }

  /** The device loses its connection: the platform says so, and the requests fail. */
  function goOffline(): void {
    installed.conditions.online = false;
    device.networkState.change({ isConnected: false, isInternetReachable: false });
  }

  function goOnline(): void {
    installed.conditions.online = true;
    device.networkState.change({ isConnected: true, isInternetReachable: true });
  }

  const credentials = { email: alice.user.email, password: TEST_PASSWORD };
  return { server, device, monitoring, start, goOffline, goOnline, credentials };
}

const page = unwrap(createPageRequest({ limit: 10 }));

function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Expected a success, got ${JSON.stringify(result.error)}`);
  return result.value;
}

async function list(container: HttpContainer, period: MeetingPeriod = MEETING_PERIOD.Upcoming) {
  return container.useCases.listMeetings.execute({ period, request: page });
}

type MeetingPeriod = (typeof MEETING_PERIOD)[keyof typeof MEETING_PERIOD];

const MEETING = aMeetingId();
const FIRST = aResolutionId('resolution-1');
const SECOND = aResolutionId('resolution-2');

describe('createContainer, http configuration, end to end', () => {
  it('builds a container of the http kind, with all the use cases and the settings of the screens', async () => {
    const { start } = aWorld();

    const container = await start();

    expect(container.kind).toBe(ADAPTERS.Http);
    expect(Object.keys(container.useCases)).toContain('observeConnectivity');
    expect(container.settings.meetingsPageSize).toBeGreaterThan(0);
    expect('demoControls' in container).toBe(false);
    expect(container.clock.now()).toBeGreaterThan(0);
  });

  it('runs the whole journey: sign in, list, detail, vote, offline, queued vote, back online, sync, restart', async () => {
    const { start, device, goOffline, goOnline, credentials, server, monitoring } = aWorld();
    const container = await start();

    // A cold start: nobody is signed in.
    expect(valueOf(await container.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.None,
    );
    const refused = await list(container);
    expect(!refused.ok && refused.error.code).toBe(AUTHENTICATION_ERROR_CODE.NotAuthenticated);

    // Sign in, list, open the meeting.
    valueOf(await container.useCases.signIn.execute(credentials));
    const listed = valueOf(await list(container));
    expect(listed.source).toEqual({ freshness: FRESHNESS.Fresh });
    expect(listed.data.items.map(({ id }) => id)).toEqual([MEETING]);
    const detail = valueOf(await container.useCases.getMeeting.execute({ meetingId: MEETING }));
    expect(detail.source).toEqual({ freshness: FRESHNESS.Fresh });
    expect(detail.data.agenda.length).toBeGreaterThan(0);

    // Vote online: the biometrics confirm it, the server records it.
    const voted = valueOf(
      await container.useCases.castVote.execute({
        meetingId: MEETING,
        resolutionId: FIRST,
        choice: VOTE_CHOICE.For,
      }),
    );
    expect(voted.status).toBe(CAST_VOTE_STATUS.Submitted);
    expect(device.biometrics.prompts).toEqual([`prompt:${BIOMETRIC_REASON.ConfirmVote}`]);
    expect(server.backend.recordedVotes().map(({ resolutionId }) => resolutionId)).toEqual([FIRST]);

    // The connection drops: the app is told, the saved copy is served, a vote is queued.
    const statuses: ConnectivityStatus[] = [];
    const observation = await container.useCases.observeConnectivity.execute((status) => {
      statuses.push(status);
    });
    expect(observation.status).toBe(Online);
    goOffline();
    await settle();
    expect(statuses).toEqual([Offline]);

    const stale = valueOf(await list(container));
    expect(stale.source.freshness).toBe(FRESHNESS.Stale);
    expect(stale.data.items.map(({ id }) => id)).toEqual([MEETING]);
    const queued = valueOf(
      await container.useCases.castVote.execute({
        meetingId: MEETING,
        resolutionId: SECOND,
        choice: VOTE_CHOICE.Against,
      }),
    );
    expect(queued.status).toBe(CAST_VOTE_STATUS.Queued);
    expect(valueOf(await container.useCases.listPendingVotes.execute()).pending).toHaveLength(1);

    // The app is stopped and started again, still offline: everything is found where it was left.
    const restarted = await start();
    expect(valueOf(await restarted.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.UnlockRequired,
    );
    const locked = await list(restarted);
    expect(!locked.ok && locked.error.code).toBe(AUTHENTICATION_ERROR_CODE.AppLocked);
    valueOf(await restarted.useCases.unlockApp.execute());
    expect(device.biometrics.prompts.at(-1)).toBe(`prompt:${BIOMETRIC_REASON.UnlockApp}`);
    const staleAgain = valueOf(await list(restarted));
    expect(staleAgain.source.freshness).toBe(FRESHNESS.Stale);
    expect(staleAgain.data.items.map(({ id }) => id)).toEqual([MEETING]);
    const stillPending = valueOf(await restarted.useCases.listPendingVotes.execute()).pending;
    expect(stillPending.map(({ vote }) => vote.resolutionId)).toEqual([SECOND]);

    // The connection comes back: the app is told, and the queue is sent.
    goOnline();
    await settle();
    expect(statuses).toEqual([Offline, Online]);
    const sync = valueOf(await restarted.useCases.syncPendingVotes.execute());
    expect(sync.outcome).toBe(SYNC_OUTCOME.Completed);
    expect(valueOf(await restarted.useCases.listPendingVotes.execute()).pending).toEqual([]);
    expect(
      server.backend
        .recordedVotes()
        .map(({ resolutionId }) => resolutionId)
        .sort(),
    ).toEqual([FIRST, SECOND]);
    const fresh = valueOf(await list(restarted));
    expect(fresh.source.freshness).toBe(FRESHNESS.Fresh);

    // Signing out forgets the session on the device: the next start finds nobody.
    valueOf(await restarted.useCases.signOut.execute());
    const last = await start();
    expect(valueOf(await last.useCases.restoreSession.execute()).status).toBe(SESSION_RESTORE.None);

    // None of it, personal or not, went to the monitoring in a form that reveals it.
    const logged = JSON.stringify([monitoring.logs, monitoring.errors]);
    expect(logged).not.toContain(credentials.email);
    expect(logged).not.toContain(credentials.password);
    expect(logged).not.toContain(VOTE_CHOICE.Against);
    observation.unsubscribe();
  });

  it('keeps the database encrypted with a key that only the secure storage holds', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    await list(container);

    const stored = device.storage.snapshot();

    expect(stored[SECURE_STORAGE_KEY.DatabaseKey]).toMatch(/^[0-9a-f]{64}$/);
    expect(
      device.opener.keysUsed.every((key) => key === stored[SECURE_STORAGE_KEY.DatabaseKey]),
    ).toBe(true);
    // The token is in the keychain, not in the session the application sees.
    expect(JSON.parse(stored[SECURE_STORAGE_KEY.Session] ?? '{}')).toMatchObject({
      token: expect.any(String),
    });
  });

  it('refuses a vote the biometrics do not confirm, and keeps nothing', async () => {
    const { start, device, credentials, server } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    device.biometrics.outcome = { success: false, error: 'user_cancel' };

    const cancelled = await container.useCases.castVote.execute({
      meetingId: MEETING,
      resolutionId: FIRST,
      choice: VOTE_CHOICE.For,
    });

    expect(!cancelled.ok && cancelled.error.code).toBe(BIOMETRIC_ERROR_CODE.Cancelled);
    expect(server.backend.recordedVotes()).toEqual([]);
    expect(valueOf(await container.useCases.listPendingVotes.execute()).pending).toEqual([]);
  });

  it('ends the session when the server no longer knows the token, and empties the saved copies', async () => {
    const { start, credentials, server } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    valueOf(await list(container));
    server.api.revokeSessions();

    const refused = await list(container);

    expect(!refused.ok && refused.error.code).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
    // The copies of the user were emptied: nothing is served from the cache any more.
    installed.conditions.online = false;
    const offline = await list(container);
    expect(!offline.ok && offline.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
  });

  it('keeps the queue of a voter through a sign-out, and sends it when they come back', async () => {
    const { start, goOffline, goOnline, credentials, server } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    valueOf(await container.useCases.getMeeting.execute({ meetingId: MEETING }));
    goOffline();
    valueOf(
      await container.useCases.castVote.execute({
        meetingId: MEETING,
        resolutionId: FIRST,
        choice: VOTE_CHOICE.Abstain,
      }),
    );
    valueOf(await container.useCases.signOut.execute());
    goOnline();

    valueOf(await container.useCases.signIn.execute(credentials));
    const sync = valueOf(await container.useCases.syncPendingVotes.execute());

    expect(sync.outcome).toBe(SYNC_OUTCOME.Completed);
    expect(server.backend.recordedVotes()).toHaveLength(1);
  });
});

describe('startContainer, http configuration, when it cannot start', () => {
  it.each([
    ['without the address of the API', undefined, CONTAINER_ERROR_CODE.MissingApiBaseUrl],
    ['with an address that is not one', 'boardroom', CONTAINER_ERROR_CODE.InvalidApiBaseUrl],
    [
      'with an http address outside of a development build',
      'http://api.example.com',
      CONTAINER_ERROR_CODE.InsecureApiBaseUrl,
    ],
  ])(
    'says so %s, with a code of its own, before it touches the device',
    async (_name, apiBaseUrl, code) => {
      const { device } = aWorld();

      const started = await startContainer(
        { adapters: ADAPTERS.Http, apiBaseUrl },
        { development: false },
        { platform: device.platform, biometricPromptText: (reason) => reason },
      );

      expect(started).toEqual({ ok: false, error: { code } });
      expect(device.storage.snapshot()).toEqual({});
      expect(device.opener.keysUsed).toEqual([]);
    },
  );

  it('says the storage is unavailable when the keychain cannot be read, and starts nothing', async () => {
    const { start, device } = aWorld();
    device.storage.failNext();

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      { platform: device.platform, biometricPromptText: (reason) => reason },
    );

    expect(started).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.StorageUnavailable, reason: DATABASE_FAILURE.KeyStorage },
    });
    expect(await start()).toMatchObject({ kind: ADAPTERS.Http });
  });

  it('refuses to start on an engine that cannot encrypt, instead of keeping the data in clear', async () => {
    const { device } = aWorld();
    device.opener.setCipher(false);

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      { platform: device.platform, biometricPromptText: (reason) => reason },
    );

    expect(started).toEqual({
      ok: false,
      error: {
        code: CONTAINER_ERROR_CODE.StorageUnavailable,
        reason: DATABASE_FAILURE.EncryptionUnavailable,
      },
    });
  });

  it('says the storage is unavailable when the database cannot be opened', async () => {
    const { device } = aWorld();
    device.opener.failNextOpenWith(OPEN_FAILURE.Failed);

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      { platform: device.platform, biometricPromptText: (reason) => reason },
    );

    expect(started).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.StorageUnavailable, reason: DATABASE_FAILURE.Open },
    });
  });
});

/** Lets the events of the platform reach the use cases. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
