import type { DevicePlatform } from '@composition/device/DevicePlatform';
import { FRESHNESS } from '@core/application/offline/Loaded';
import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { ConnectivityStatus } from '@core/application/ports/Connectivity';
import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { AUTHENTICATION_ERROR_CODE } from '@core/domain/errors/AuthenticationError';
import { BIOMETRIC_ERROR_CODE } from '@core/domain/errors/BiometricError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import type { Result } from '@core/domain/shared/Result';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import { DATABASE_FAILURE } from '@core/infrastructure/persistence/protectedDatabase';
import { SECURE_STORAGE_KEY } from '@core/infrastructure/secure-storage/SecureStorage';
import { FakeNetworkState } from '@core/infrastructure/testing/FakeNetworkState';
import { MemorySecureStorage } from '@core/infrastructure/testing/MemorySecureStorage';
import {
  NodeSqliteOpener,
  freshDirectory,
  nodeFileSystem,
} from '@core/infrastructure/testing/NodeSqlite';
import { SimulatedCipherOpener } from '@core/infrastructure/testing/SimulatedCipherOpener';
import { nodeRandomBytes } from '@core/infrastructure/testing/nodeRandomBytes';
import { testFileStore } from '@core/infrastructure/testing/testFiles';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { SESSION_RESTORE } from '@features/auth/application/use-cases/RestoreSession';
import { HoldingMeetingCache } from '@features/meetings/application/testing/HoldingMeetingCache';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import { SYNC_OUTCOME } from '@features/votes/application/use-cases/SyncPendingVotes';
import { aMeetingId, aResolutionId, unwrap } from '@testing/domain/builders';
import {
  createHttpServerSide,
  installMockApi,
  TEST_API_URL,
} from '@testing/infrastructure/httpWorld';
import { databaseDirectory } from '@testing/infrastructure/testDatabase';
import { TEST_PASSWORD } from '@testing/infrastructure/testServer';

import {
  APP_LOCK_GRACE_PERIOD,
  DATABASE_NAME,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
} from './config';
import { parseConfiguration } from './configuration';
import type { RawSettings } from './configuration';
import { ADAPTERS } from './adapters';
import type { ContainerRuntime } from './ContainerRuntime';
import { startContainer } from './createContainer';
import type { HttpContainer } from './createContainer';
import { CONTAINER_ERROR_CODE } from './errors';
import { createHttpPorts } from './httpPorts';
import { wireUseCases } from './wireUseCases';

// The http configuration, end to end: the real container, wired to the real HTTP adapters, the real
// SQLite adapters over Node's SQLite, the secure storage in memory, the biometrics and the network
// of the device scripted, and the simulated server behind MSW. Nothing is replaced under the use
// cases but the device and the network.

const CANCEL_LABEL = 'Annuler';
/** Longer than the shortest timeout the configuration accepts. */
const SLOWER_THAN_THE_TIMEOUT_MILLIS = 1400;
const promptText: ContainerRuntime['biometricPromptText'] = (reason) => ({
  message: reason,
  cancelLabel: CANCEL_LABEL,
});

const installed = installMockApi();
const directory = databaseDirectory();
const { Online, Offline } = CONNECTIVITY_STATUS;

/** A device that outlives the app: the keychain, the files and the network state stay when it restarts. */
function aDevice() {
  const storage = new MemorySecureStorage();
  const files = new NodeSqliteOpener(freshDirectory(directory), nodeFileSystem());
  const opener = new SimulatedCipherOpener(files);
  const networkState = new FakeNetworkState();
  const biometrics = {
    hardware: true,
    enrolled: true,
    prompts: [] as string[],
    /** What the platform was asked, whole. */
    asked: [] as Parameters<DevicePlatform['localAuthentication']['authenticate']>[0][],
    outcome: { success: true } as
      { success: true } | { success: false; error: 'user_cancel' | 'lockout' },
  };
  const platform: DevicePlatform = {
    databaseOpener: opener,
    secureStorage: storage,
    randomBytes: nodeRandomBytes,
    localAuthentication: {
      hasHardware: () => Promise.resolve(biometrics.hardware),
      isEnrolled: () => Promise.resolve(biometrics.enrolled),
      authenticate: (options) => {
        biometrics.prompts.push(options.promptMessage);
        biometrics.asked.push(options);
        return Promise.resolve(biometrics.outcome);
      },
    },
    networkState,
  };
  return { storage, opener, files, fileStore: testFileStore(), networkState, biometrics, platform };
}

type Device = ReturnType<typeof aDevice>;

/** The server, and a way to start the app on a device, any number of times. */
function aWorld() {
  const server = createHttpServerSide(installed);
  const device = aDevice();
  const monitoring = new FakeMonitoring();
  const [alice] = server.accounts;
  if (alice === undefined) throw new Error('The test server has no account.');

  async function start(
    on: Device = device,
    overrides: Partial<ContainerRuntime> = {},
    settings: Partial<RawSettings> = {},
  ) {
    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL, ...settings },
      { development: true },
      {
        clock: server.clock,
        monitoring,
        platform: on.platform,
        fileStore: on.fileStore,
        biometricPromptText: (reason) => ({
          message: `prompt:${reason}`,
          cancelLabel: CANCEL_LABEL,
        }),
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

    // The generation of the file, and the key.
    expect(stored[SECURE_STORAGE_KEY.DatabaseKey]).toMatch(/^[0-9]+:[0-9a-f]{64}$/);
    expect(
      device.opener.keysUsed.every(
        (key) => key === stored[SECURE_STORAGE_KEY.DatabaseKey]?.slice(-64),
      ),
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

  it('ends the session when the server no longer knows the token: it is forgotten on the device', async () => {
    const { start, device, credentials, server } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    valueOf(await list(container));
    server.api.revokeSessions();

    const refused = await list(container);

    expect(!refused.ok && refused.error.code).toBe(REPOSITORY_ERROR_CODE.Unauthorized);
    // The session is gone from the keychain, so that a restart does not find it.
    expect(device.storage.snapshot()[SECURE_STORAGE_KEY.Session]).toBeUndefined();
    const restarted = await start();
    expect(valueOf(await restarted.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.None,
    );
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

/** The app on a device whose cache of meetings is slow, signed in, with a meeting saved on it. */
async function aSlowCache() {
  const world = aWorld();
  const parsed = valueOf(
    parseConfiguration(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
    ),
  );
  if (parsed.kind !== ADAPTERS.Http) throw new Error('Expected the http configuration.');
  // The real adapters of the configuration (HTTP, SQLite over Node, the secure storage), wired by
  // hand so that the SQLite cache of meetings has a slow storage in front of it.
  const wiring = valueOf(
    await createHttpPorts(parsed, {
      clock: world.server.clock,
      monitoring: world.monitoring,
      platform: world.device.platform,
      fileStore: world.device.fileStore,
      biometricPromptText: promptText,
    }),
  );
  const cache = new HoldingMeetingCache(wiring.ports.meetingCache);
  const useCases = wireUseCases(
    { ...wiring.ports, meetingCache: cache },
    {
      maxCacheAge: MAX_CACHE_AGE,
      maxAttempts: MAX_VOTE_DELIVERY_ATTEMPTS,
      gracePeriod: APP_LOCK_GRACE_PERIOD,
      startsLocked: false,
    },
  );
  const session = valueOf(await useCases.signIn.execute(world.credentials));
  valueOf(await useCases.getMeeting.execute({ meetingId: MEETING }));
  const copy = async () => valueOf(await cache.readMeeting(session.user.id, MEETING));
  expect(await copy()).toBeDefined();
  return { ...world, cache, useCases, copy };
}

describe('createContainer, http configuration, a vote recorded while the user signs out', () => {
  it('does not write the meeting of the user who left back to the file once the vote is submitted', async () => {
    const { cache, useCases, copy } = await aSlowCache();
    const read = cache.holdNextRead();

    const casting = useCases.castVote.execute({
      meetingId: MEETING,
      resolutionId: FIRST,
      choice: VOTE_CHOICE.For,
    });
    await read.hasAnswered;
    valueOf(await useCases.signOut.execute());
    expect(await copy()).toBeUndefined();
    read.release();

    expect(valueOf(await casting).status).toBe(CAST_VOTE_STATUS.Submitted);
    expect(await copy()).toBeUndefined();
  });

  it('does not write it back either when a synchronisation sends the queued vote', async () => {
    const { cache, useCases, copy, goOffline, goOnline } = await aSlowCache();
    goOffline();
    const queued = valueOf(
      await useCases.castVote.execute({
        meetingId: MEETING,
        resolutionId: FIRST,
        choice: VOTE_CHOICE.For,
      }),
    );
    expect(queued.status).toBe(CAST_VOTE_STATUS.Queued);
    goOnline();
    const read = cache.holdNextRead();

    const syncing = useCases.syncPendingVotes.execute();
    await read.hasAnswered;
    valueOf(await useCases.signOut.execute());
    expect(await copy()).toBeUndefined();
    read.release();

    expect(valueOf(await syncing).outcome).toBeDefined();
    expect(await copy()).toBeUndefined();
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
        { platform: device.platform, biometricPromptText: promptText },
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
      { platform: device.platform, biometricPromptText: promptText },
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
      { platform: device.platform, biometricPromptText: promptText },
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
    device.opener.failNextOpens();

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      { platform: device.platform, biometricPromptText: promptText },
    );

    expect(started).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.StorageUnavailable, reason: DATABASE_FAILURE.Open },
    });
  });
});

describe('startContainer, http configuration, the settings reach the adapters', () => {
  it.each([
    [false, true],
    [true, false],
  ])(
    'with the passcode accepted = %s, the prompt of the biometrics disables the fallback = %s',
    async (accepted, disabled) => {
      const { start, device, credentials } = aWorld();
      const container = await start(device, {}, { allowDevicePasscode: accepted });
      valueOf(await container.useCases.signIn.execute(credentials));
      valueOf(await container.useCases.restoreSession.execute());

      valueOf(await container.useCases.unlockApp.execute());

      expect(device.biometrics.asked.map((asked) => asked.disableDeviceFallback)).toEqual([
        disabled,
      ]);
    },
  );

  it('refuses the passcode by default', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    valueOf(await container.useCases.restoreSession.execute());

    valueOf(await container.useCases.unlockApp.execute());

    expect(device.biometrics.asked.map((asked) => asked.disableDeviceFallback)).toEqual([true]);
  });

  it('asks for strong biometrics, with the cancel label of the language, for the reason it was given', async () => {
    const { start, device, credentials } = aWorld();
    const container = await start();
    valueOf(await container.useCases.signIn.execute(credentials));
    valueOf(await container.useCases.restoreSession.execute());

    valueOf(await container.useCases.unlockApp.execute());

    expect(device.biometrics.asked).toEqual([
      {
        promptMessage: `prompt:${BIOMETRIC_REASON.UnlockApp}`,
        cancelLabel: CANCEL_LABEL,
        disableDeviceFallback: true,
        biometricsSecurityLevel: 'strong',
      },
    ]);
  });

  it('gives the requests the timeout of the setting: a server that never answers is a network failure in time', async () => {
    const { start, credentials } = aWorld();
    const container = await start(undefined, {}, { requestTimeoutMillis: 1000 });
    valueOf(await container.useCases.signIn.execute(credentials));
    // A server slower than the setting, which answers after it: the request is given up on at the
    // timeout, and the late answer is let through before the next test, so that it reaches nobody.
    installed.conditions.delayMillis = SLOWER_THAN_THE_TIMEOUT_MILLIS;

    const started = Date.now();
    const listed = await list(container);
    const elapsed = Date.now() - started;
    await new Promise((resolve) => setTimeout(resolve, SLOWER_THAN_THE_TIMEOUT_MILLIS));

    expect(!listed.ok && listed.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
    // The default is fifteen seconds: the server answers long before.
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(SLOWER_THAN_THE_TIMEOUT_MILLIS);
  });

  it('refuses a timeout out of bounds and a passcode setting that is not a yes or a no, before it touches the device', async () => {
    const { device } = aWorld();

    const timeout = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL, requestTimeoutMillis: 5 },
      { development: true },
      { platform: device.platform, biometricPromptText: promptText },
    );
    const passcode = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL, allowDevicePasscode: 'yes' },
      { development: true },
      { platform: device.platform, biometricPromptText: promptText },
    );

    expect(timeout).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidRequestTimeout },
    });
    expect(passcode).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidBiometricFallback },
    });
    expect(device.storage.snapshot()).toEqual({});
  });
});

describe('startContainer, http configuration, when local data cannot be read', () => {
  /** Votes cast offline, waiting in the encrypted database, and the app stopped. */
  async function aDeviceWithAWaitingVote() {
    const world = aWorld();
    const container = await world.start();
    valueOf(await container.useCases.signIn.execute(world.credentials));
    valueOf(await container.useCases.getMeeting.execute({ meetingId: MEETING }));
    world.goOffline();
    valueOf(
      await container.useCases.castVote.execute({
        meetingId: MEETING,
        resolutionId: FIRST,
        choice: VOTE_CHOICE.For,
      }),
    );
    world.goOnline();
    return world;
  }

  it('starts on a new database, tells the notice once, and keeps the old file', async () => {
    const world = await aDeviceWithAWaitingVote();
    // The keychain gives back a key that does not open the file: a restored backup, say.
    world.device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, `0:${'c'.repeat(64)}`);

    const restarted = await world.start();

    expect(restarted.notices.localDataReset).toBe(true);
    expect(valueOf(await restarted.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.UnlockRequired,
    );
    valueOf(await restarted.useCases.unlockApp.execute());
    expect(valueOf(await restarted.useCases.listPendingVotes.execute()).pending).toEqual([]);
    expect(world.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.DatabaseRecreated]);
    expect(world.device.files.exists(DATABASE_NAME)).toBe(true);
  });

  it('tells the notice again at the next start until it is acknowledged, and not after', async () => {
    const world = await aDeviceWithAWaitingVote();
    world.device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, `0:${'c'.repeat(64)}`);
    const first = await world.start();

    const again = await world.start();
    await again.notices.acknowledgeLocalDataReset();
    const after = await world.start();

    expect(first.notices.localDataReset).toBe(true);
    expect(again.notices.localDataReset).toBe(true);
    expect(after.notices.localDataReset).toBe(false);
  });

  it('has nothing to tell on a start where nothing was lost', async () => {
    const world = aWorld();

    const container = await world.start();
    await world.start();

    expect(container.notices.localDataReset).toBe(false);
  });

  it('does not start, and sets nothing aside, when what the keychain holds is not a key', async () => {
    const world = await aDeviceWithAWaitingVote();
    world.device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, 'not a key');

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      { platform: world.device.platform, biometricPromptText: promptText },
    );

    expect(started).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.StorageUnavailable, reason: DATABASE_FAILURE.KeyStorage },
    });
    expect(world.device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBeUndefined();
  });
});

describe('startContainer, when something the device provides fails to load', () => {
  it('answers with an error of its own instead of rejecting, whatever was thrown', async () => {
    // Reading the platform is where the modules under it are loaded, in the real runtime.
    const runtime: ContainerRuntime = { biometricPromptText: promptText };
    Object.defineProperty(runtime, 'platform', {
      get: (): never => {
        throw new Error('Cannot find native module /private/path/ExpoSQLite');
      },
    });

    const started = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: TEST_API_URL },
      { development: true },
      runtime,
    );

    expect(started).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.PlatformUnavailable },
    });
  });
});

/** Lets the events of the platform reach the use cases. */
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
