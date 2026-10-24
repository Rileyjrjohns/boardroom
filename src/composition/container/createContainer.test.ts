import { DEMO_PASSWORD } from '@composition/dev/in-memory/seed';
import { FRESHNESS } from '@core/application/offline/Loaded';
import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { ConnectivityStatus } from '@core/application/ports/Connectivity';
import { FakeClock } from '@core/application/testing/FakeClock';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import type { DevicePlatform } from '@composition/device/DevicePlatform';
import { BIOMETRIC_REASON } from '@features/auth/application/ports/BiometricGate';
import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { VOTE_DELIVERY_ERROR_CODE } from '@features/votes/domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@features/votes/domain/errors/VotingError';
import { isOk } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import { createPageRequest } from '@core/domain/value-objects/PageRequest';
import { immediateSleep, recordingSleep } from '@core/infrastructure/testing/sleep';
import { testFileStore } from '@core/infrastructure/testing/testFiles';
import { SESSION_RESTORE } from '@features/auth/application/use-cases/RestoreSession';
import type { InMemoryScreenProtection } from '@features/documents/infrastructure/InMemoryScreenProtection';
import { HoldingMeetingCache } from '@features/meetings/application/testing/HoldingMeetingCache';
import { CONFIDENTIALITY_LEVEL } from '@features/meetings/domain/entities/Document';
import { findResolution } from '@features/meetings/domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@features/meetings/domain/entities/Resolution';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { VOTE_CHOICE } from '@features/meetings/domain/value-objects/VoteChoice';
import { CAST_VOTE_STATUS } from '@features/votes/application/use-cases/CastVote';
import { SYNC_OUTCOME } from '@features/votes/application/use-cases/SyncPendingVotes';
import { MILLIS_PER_DAY, NOW, aDuration, unwrap } from '@testing/domain/builders';

import { ADAPTERS } from './adapters';
import {
  APP_LOCK_GRACE_PERIOD,
  MAX_CACHE_AGE,
  MAX_VOTE_DELIVERY_ATTEMPTS,
  MEETINGS_PAGE_SIZE,
} from './config';
import { defaultMockConfiguration } from './configuration';
import type { MockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { createContainer, startContainer } from './createContainer';
import type { MockContainer } from './createContainer';
import { CONTAINER_ERROR_CODE } from './errors';
import { createMockPorts } from './mockPorts';
import { wireUseCases } from './wireUseCases';

/**
 * What the container reads from the outside, replaced: a clock that stands still, a network that
 * does not wait, and a monitoring that writes nowhere, so that a test prints nothing to the console.
 */
const silentRuntime = (overrides: Partial<ContainerRuntime> = {}): ContainerRuntime => ({
  clock: new FakeClock(),
  sleep: immediateSleep,
  monitoring: new FakeMonitoring(),
  biometricPromptText: (reason) => ({ message: reason, cancelLabel: 'cancel' }),
  fileStore: testFileStore(),
  ...overrides,
});

/** The simulated screen protection of a container: Jest has no native module, so it is the one in use. */
function simulatedScreenProtection(container: MockContainer): InMemoryScreenProtection {
  const { screenProtection } = container.controls;
  if (screenProtection === undefined) throw new Error('The screen protection is not simulated.');
  return screenProtection;
}

/** What the fake local authentication of a device is and does; the prompts it showed are recorded. */
interface FakeBiometrics {
  hardware: boolean;
  enrolled: boolean;
  readonly prompts: string[];
}

/**
 * A device whose local authentication is scripted. The mock configuration reads nothing else of the
 * platform here (the screen protection module is absent, so it stays the simulation).
 */
function aDeviceWithBiometrics(overrides: Partial<FakeBiometrics> = {}) {
  const biometrics: FakeBiometrics = { hardware: true, enrolled: true, prompts: [], ...overrides };
  const platform = {
    localAuthentication: {
      hasHardware: () => Promise.resolve(biometrics.hardware),
      isEnrolled: () => Promise.resolve(biometrics.enrolled),
      authenticate: (options: { readonly promptMessage: string }) => {
        biometrics.prompts.push(options.promptMessage);
        return Promise.resolve({ success: true } as const);
      },
    },
  } as unknown as DevicePlatform;
  return { biometrics, platform };
}

const ALICE = 'alice.martin@boardroom.example';
const BRUNO = 'bruno.durand@boardroom.example';

/** The mock configuration the tests use: signed in as the demo user at start, and no latency. */
function mock(overrides: Partial<MockConfiguration> = {}): MockConfiguration {
  return {
    ...defaultMockConfiguration(),
    startSignedIn: true,
    latency: aDuration(0),
    ...overrides,
  };
}

/** A mock container that does not wait and whose clock stands still. */
async function aContainer(config: MockConfiguration = mock()): Promise<{
  container: MockContainer;
  clock: FakeClock;
}> {
  const clock = new FakeClock();
  const created = await createContainer(config, silentRuntime({ clock }));
  if (!created.ok) throw new Error(`The container was not built: ${JSON.stringify(created.error)}`);
  return { container: created.value, clock };
}

const page = unwrap(createPageRequest({ limit: MEETINGS_PAGE_SIZE }));

async function firstMeetingOf(container: Pick<MockContainer, 'useCases'>, period: MeetingPeriod) {
  const listed = await container.useCases.listMeetings.execute({ period, request: page });
  if (!listed.ok) throw new Error(`The list failed: ${JSON.stringify(listed.error)}`);
  const first = listed.value.data.items[0];
  if (first === undefined) throw new Error('The list is empty.');
  return first;
}

function valueOf<T, E>(result: Result<T, E>): T {
  if (!result.ok) throw new Error(`Expected a success, got ${JSON.stringify(result.error)}`);
  return result.value;
}

/** A meeting of the first page of the upcoming ones that has an open resolution nobody voted on. */
async function anOpenResolution(container: Pick<MockContainer, 'useCases'>) {
  const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
  const meeting = valueOf(
    await container.useCases.getMeeting.execute({ meetingId: upcoming.id }),
  ).data;
  const resolution = meeting.agenda
    .flatMap((item) => (item.resolution === undefined ? [] : [item.resolution]))
    .find(
      (candidate) =>
        candidate.status === RESOLUTION_STATUS.Open && candidate.recordedVote === undefined,
    );
  if (resolution === undefined)
    throw new Error('The first upcoming meeting has no open resolution.');
  return { meeting, resolution };
}

describe('createContainer, mock configuration', () => {
  it('builds a container with the use cases, the settings of the screens and the controls', async () => {
    const { container } = await aContainer();

    expect(container.kind).toBe(ADAPTERS.Mock);
    expect(Object.keys(container.useCases).sort()).toEqual(
      [
        'acknowledgeRejectedVote',
        'castVote',
        'closeDocument',
        'discardUnreadableVotes',
        'evaluateAppLock',
        'getCurrentUser',
        'getMeeting',
        'listMeetings',
        'listPendingVotes',
        'observeConnectivity',
        'observeScreenCapture',
        'openDocument',
        'restoreSession',
        'signIn',
        'signOut',
        'syncPendingVotes',
        'unlockApp',
      ].sort(),
    );
    expect(container.settings).toEqual({ meetingsPageSize: MEETINGS_PAGE_SIZE });
    expect(container.controls.network.online).toBe(true);
  });

  it('hands the clock the use cases read to the screens, so that one instant is not read twice from two clocks', async () => {
    const { container, clock } = await aContainer();

    expect(container.clock).toBe(clock);
  });

  it('hands the accounts of the simulation to the demo, with their shared password and nothing of the sessions', async () => {
    const { container } = await aContainer();

    expect(container.demoControls.accounts).toEqual([
      { fullName: 'Alice Martin', email: ALICE, password: DEMO_PASSWORD },
      { fullName: 'Bruno Durand', email: BRUNO, password: DEMO_PASSWORD },
    ]);
  });

  it('tells who is signed in, once the app is unlocked and not before', async () => {
    const { container } = await aContainer(mock({ startSignedIn: false }));

    await container.useCases.signIn.execute({ email: ALICE, password: DEMO_PASSWORD });
    const user = valueOf(await container.useCases.getCurrentUser.execute());

    expect(user.email).toBe(ALICE);
    await container.useCases.signOut.execute();
    expect((await container.useCases.getCurrentUser.execute()).ok).toBe(false);
  });

  it('serves meetings from the first use case to the detail, using only the container', async () => {
    const { container } = await aContainer();

    const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
    const past = await firstMeetingOf(container, MEETING_PERIOD.Past);
    const detail = valueOf(await container.useCases.getMeeting.execute({ meetingId: upcoming.id }));

    expect(upcoming.scheduledAt).toBeGreaterThan(NOW);
    expect(past.scheduledAt).toBeLessThanOrEqual(NOW);
    expect(detail.source).toEqual({ freshness: FRESHNESS.Fresh });
    expect(detail.data.id).toBe(upcoming.id);
    expect(detail.data.agenda.length).toBeGreaterThan(0);
    expect(detail.data.participants.length).toBeGreaterThan(0);
    expect(detail.data.documents.length).toBeGreaterThan(0);
  });

  it('pages through the whole list with the cursors it gives', async () => {
    const { container } = await aContainer();
    let cursor = undefined as undefined | NonNullable<typeof page.cursor>;
    let seen = 0;
    let pages = 0;

    do {
      const request = unwrap(
        createPageRequest({
          limit: MEETINGS_PAGE_SIZE,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      );
      const listed = valueOf(
        await container.useCases.listMeetings.execute({ period: MEETING_PERIOD.Past, request }),
      );
      seen += listed.data.items.length;
      cursor = listed.data.nextCursor;
      pages += 1;
    } while (cursor !== undefined);

    expect(pages).toBeGreaterThan(2);
    expect(seen).toBeGreaterThan(2 * MEETINGS_PAGE_SIZE);
  });

  it('shifts its content to the clock it is given', async () => {
    const created = await createContainer(mock(), silentRuntime({ clock: new FakeClock(NOW) }));
    const container = valueOf(created);

    const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);

    expect(upcoming.scheduledAt - NOW).toBeLessThan(5 * MILLIS_PER_DAY);
  });

  it('starts with the demo user signed in, behind the named option', async () => {
    const { container } = await aContainer(mock({ startSignedIn: true }));

    const restored = valueOf(await container.useCases.restoreSession.execute());

    expect(restored.status).toBe(SESSION_RESTORE.UnlockRequired);
  });

  it('starts signed out when the option is off, and the demo accounts then sign in', async () => {
    const { container } = await aContainer(mock({ startSignedIn: false }));
    const refused = await container.useCases.listMeetings.execute({
      period: MEETING_PERIOD.Upcoming,
      request: page,
    });

    expect(!refused.ok && refused.error.code).toBe(AUTHENTICATION_ERROR_CODE.NotAuthenticated);
    expect(valueOf(await container.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.None,
    );

    const session = valueOf(
      await container.useCases.signIn.execute({ email: BRUNO, password: DEMO_PASSWORD }),
    );
    expect(session.user.email).toBe(BRUNO);
    expect(
      isOk(
        await container.useCases.listMeetings.execute({
          period: MEETING_PERIOD.Upcoming,
          request: page,
        }),
      ),
    ).toBe(true);
  });

  it('refuses the wrong password of a demo account', async () => {
    const { container } = await aContainer(mock({ startSignedIn: false }));

    const refused = await container.useCases.signIn.execute({ email: ALICE, password: 'nope' });

    expect(!refused.ok && refused.error.code).toBe(AUTHENTICATION_ERROR_CODE.InvalidCredentials);
  });

  it('gives the two demo users different lists of meetings', async () => {
    const { container } = await aContainer(mock({ startSignedIn: false }));
    const idsAs = async (email: string) => {
      await container.useCases.signIn.execute({ email, password: DEMO_PASSWORD });
      const ids: string[] = [];
      let cursor = undefined as undefined | NonNullable<typeof page.cursor>;
      do {
        const request = unwrap(
          createPageRequest({ limit: 50, ...(cursor === undefined ? {} : { cursor }) }),
        );
        const listed = valueOf(
          await container.useCases.listMeetings.execute({ period: MEETING_PERIOD.Past, request }),
        );
        ids.push(...listed.data.items.map(({ id }) => id));
        cursor = listed.data.nextCursor;
      } while (cursor !== undefined);
      return ids;
    };

    const alice = await idsAs(ALICE);
    const bruno = await idsAs(BRUNO);

    expect(bruno.length).toBeGreaterThan(0);
    expect(bruno.length).toBeLessThan(alice.length);
    expect(bruno.every((id) => alice.includes(id))).toBe(true);
  });

  it('wires every use case to working adapters', async () => {
    const { container } = await aContainer();
    const { useCases } = container;
    const { meeting, resolution } = await anOpenResolution(container);
    const confidential = meeting.documents.find(
      ({ confidentiality }) => confidentiality === CONFIDENTIALITY_LEVEL.Confidential,
    );
    if (confidential === undefined) throw new Error('The meeting has no confidential document.');

    // The application lock and the biometrics.
    expect(valueOf(await useCases.evaluateAppLock.execute({ backgroundedAt: NOW }))).toBe(false);
    expect(isOk(await useCases.unlockApp.execute())).toBe(true);

    // A confidential document: its screen is protected, its content is local.
    const opened = valueOf(await useCases.openDocument.execute({ documentId: confidential.id }));
    expect(opened.screenProtected).toBe(true);
    expect(opened.watermark.email).toBe(ALICE);
    expect(isOk(await useCases.closeDocument.execute({ documentId: confidential.id }))).toBe(true);
    expect(
      isOk(
        await useCases.observeScreenCapture.execute(
          { documentId: confidential.id },
          () => undefined,
        ),
      ),
    ).toBe(true);

    // A vote goes to the simulated server, and the meeting then shows it.
    const cast = valueOf(
      await useCases.castVote.execute({
        meetingId: meeting.id,
        resolutionId: resolution.id,
        choice: VOTE_CHOICE.For,
      }),
    );
    expect(cast.status).toBe(CAST_VOTE_STATUS.Submitted);
    const seen = valueOf(await useCases.getMeeting.execute({ meetingId: meeting.id })).data;
    expect(findResolution(seen, resolution.id)?.recordedVote).toBe(VOTE_CHOICE.For);

    // The outbox.
    expect(valueOf(await useCases.listPendingVotes.execute())).toEqual({
      pending: [],
      rejected: [],
      unreadable: 0,
    });
    expect(valueOf(await useCases.syncPendingVotes.execute()).outcome).toBe(SYNC_OUTCOME.Completed);
    expect(
      isOk(await useCases.acknowledgeRejectedVote.execute({ resolutionId: resolution.id })),
    ).toBe(true);

    // Signing out empties the caches and forgets the session.
    expect(isOk(await useCases.signOut.execute())).toBe(true);
    const after = await useCases.listMeetings.execute({
      period: MEETING_PERIOD.Upcoming,
      request: page,
    });
    expect(!after.ok && after.error.code).toBe(AUTHENTICATION_ERROR_CODE.NotAuthenticated);
  });

  it('refuses a second vote on a resolution, whatever the choice', async () => {
    const { container } = await aContainer();
    const { meeting, resolution } = await anOpenResolution(container);
    const input = { meetingId: meeting.id, resolutionId: resolution.id, choice: VOTE_CHOICE.For };

    await container.useCases.castVote.execute(input);
    const second = await container.useCases.castVote.execute({
      ...input,
      choice: VOTE_CHOICE.Against,
    });

    expect(!second.ok && second.error.code).toBe(VOTING_ERROR_CODE.AlreadyVoted);
  });

  describe('the lock of the app', () => {
    it('is open when the configuration opened the session itself, as after a sign-in', async () => {
      const { container } = await aContainer(mock({ startSignedIn: true }));

      const listed = await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(listed.ok).toBe(true);
    });

    it('is closed by the restore of the session, for every use case, until the biometrics succeed', async () => {
      const { container } = await aContainer();
      const { useCases } = container;
      const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);

      await useCases.restoreSession.execute();

      const locked = [
        await useCases.getMeeting.execute({ meetingId: upcoming.id }),
        await useCases.listMeetings.execute({ period: MEETING_PERIOD.Upcoming, request: page }),
        await useCases.listPendingVotes.execute(),
        await useCases.syncPendingVotes.execute(),
      ];
      expect(locked.map((result) => !result.ok && result.error.code)).toEqual(
        locked.map(() => AUTHENTICATION_ERROR_CODE.AppLocked),
      );

      await useCases.unlockApp.execute();
      expect((await useCases.getMeeting.execute({ meetingId: upcoming.id })).ok).toBe(true);
      expect((await useCases.listPendingVotes.execute()).ok).toBe(true);
    });

    it('starts closed when there is no session to open, and a sign-in opens it', async () => {
      const { container } = await aContainer(mock({ startSignedIn: false }));
      await container.useCases.signIn.execute({ email: ALICE, password: DEMO_PASSWORD });

      expect((await container.useCases.listPendingVotes.execute()).ok).toBe(true);
    });
  });

  describe('single shared instances', () => {
    it('shares the screen protection coordinator: closing one view of two leaves the screen protected', async () => {
      const { container } = await aContainer();
      const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
      const meeting = valueOf(
        await container.useCases.getMeeting.execute({ meetingId: upcoming.id }),
      ).data;
      const confidential = meeting.documents.find(
        ({ confidentiality }) => confidentiality === CONFIDENTIALITY_LEVEL.Confidential,
      );
      if (confidential === undefined) throw new Error('The meeting has no confidential document.');
      const screenProtection = simulatedScreenProtection(container);
      const input = { documentId: confidential.id };

      await container.useCases.openDocument.execute(input);
      await container.useCases.openDocument.execute(input);
      expect(screenProtection.isEnabled()).toBe(true);

      await container.useCases.closeDocument.execute(input);
      expect(screenProtection.isEnabled()).toBe(true);

      await container.useCases.closeDocument.execute(input);
      expect(screenProtection.isEnabled()).toBe(false);
    });

    it('keeps the screen protected while another confidential document is open', async () => {
      const { container } = await aContainer();
      const documents = [];
      for (const period of [MEETING_PERIOD.Upcoming, MEETING_PERIOD.Past]) {
        const summary = await firstMeetingOf(container, period);
        const meeting = valueOf(
          await container.useCases.getMeeting.execute({ meetingId: summary.id }),
        ).data;
        const confidential = meeting.documents.find(
          ({ confidentiality }) => confidentiality === CONFIDENTIALITY_LEVEL.Confidential,
        );
        if (confidential !== undefined) documents.push(confidential);
      }
      const [first, second] = documents;
      if (first === undefined || second === undefined) throw new Error('Two documents are needed.');
      const screenProtection = simulatedScreenProtection(container);
      await container.useCases.openDocument.execute({ documentId: first.id });
      await container.useCases.openDocument.execute({ documentId: second.id });

      await container.useCases.closeDocument.execute({ documentId: first.id });
      expect(screenProtection.isEnabled()).toBe(true);

      await container.useCases.closeDocument.execute({ documentId: second.id });
      expect(screenProtection.isEnabled()).toBe(false);
    });

    it('shares CastVote: a second vote on the same resolution cast at the same time is refused', async () => {
      const { container } = await aContainer();
      const { meeting, resolution } = await anOpenResolution(container);
      const input = { meetingId: meeting.id, resolutionId: resolution.id, choice: VOTE_CHOICE.For };

      const first = container.useCases.castVote.execute(input);
      const second = await container.useCases.castVote.execute(input);

      expect(!second.ok && second.error.code).toBe(VOTE_DELIVERY_ERROR_CODE.InProgress);
      expect((await first).ok).toBe(true);
    });

    it('shares SyncPendingVotes: a second run during a run does nothing', async () => {
      const { container } = await aContainer();

      const first = container.useCases.syncPendingVotes.execute();
      const second = container.useCases.syncPendingVotes.execute();

      expect(valueOf(await second).outcome).toBe(SYNC_OUTCOME.AlreadyRunning);
      expect(valueOf(await first).outcome).toBe(SYNC_OUTCOME.Completed);
    });

    it('gives each container its own server, caches and outbox: nothing is shared between two', async () => {
      const first = (await aContainer()).container;
      const second = (await aContainer()).container;
      const upcoming = await firstMeetingOf(first, MEETING_PERIOD.Upcoming);
      first.controls.network.setOnline(false);

      expect(second.controls.network.online).toBe(true);
      expect(first.useCases.listMeetings).not.toBe(second.useCases.listMeetings);
      const offlineFirst = await first.useCases.getMeeting.execute({ meetingId: upcoming.id });
      const stillOnline = await second.useCases.getMeeting.execute({ meetingId: upcoming.id });
      expect(!offlineFirst.ok && offlineFirst.error.code).toBe(
        REPOSITORY_ERROR_CODE.NetworkUnavailable,
      );
      expect(stillOnline.ok).toBe(true);
    });
  });

  describe('the simulated network', () => {
    it('can be taken offline: a meeting seen before is then served from the cache, flagged stale', async () => {
      const { container } = await aContainer();
      const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
      await container.useCases.getMeeting.execute({ meetingId: upcoming.id });

      container.controls.network.setOnline(false);
      const stale = valueOf(
        await container.useCases.getMeeting.execute({ meetingId: upcoming.id }),
      );

      expect(stale.source).toEqual({ freshness: FRESHNESS.Stale, cachedAt: NOW });
      container.controls.network.setOnline(true);
      expect(
        valueOf(await container.useCases.getMeeting.execute({ meetingId: upcoming.id })).source,
      ).toEqual({ freshness: FRESHNESS.Fresh });
    });

    it('fails with networkUnavailable offline for what was never seen', async () => {
      const { container } = await aContainer();
      container.controls.network.setOnline(false);

      const result = await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(!result.ok && result.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
    });

    it('queues a vote cast offline, and sends it when the network is back', async () => {
      const { container } = await aContainer();
      const { meeting, resolution } = await anOpenResolution(container);
      container.controls.network.setOnline(false);

      const cast = valueOf(
        await container.useCases.castVote.execute({
          meetingId: meeting.id,
          resolutionId: resolution.id,
          choice: VOTE_CHOICE.Abstain,
        }),
      );
      expect(cast.status).toBe(CAST_VOTE_STATUS.Queued);
      expect(valueOf(await container.useCases.listPendingVotes.execute()).pending).toHaveLength(1);

      container.controls.network.setOnline(true);
      const sync = valueOf(await container.useCases.syncPendingVotes.execute());
      expect(sync.outcome).toBe(SYNC_OUTCOME.Completed);
      expect(valueOf(await container.useCases.listPendingVotes.execute()).pending).toEqual([]);
    });

    it('waits for the latency of the configuration through the sleep it was given', async () => {
      const { sleep, requested } = recordingSleep();
      const created = await createContainer(
        mock({ latency: aDuration(250) }),
        silentRuntime({ sleep }),
      );
      const container = valueOf(created);

      await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(requested).toEqual([250]);
      expect(container.controls.network.latency).toBe(250);
    });
  });

  describe('the connectivity of the app', () => {
    it('follows the offline switch of the demo, which the container hands to the screens', async () => {
      const { container } = await aContainer();
      const statuses: ConnectivityStatus[] = [];
      const observation = await container.useCases.observeConnectivity.execute((status) => {
        statuses.push(status);
      });

      container.demoControls.network.setOnline(false);
      container.demoControls.network.setOnline(true);

      expect(observation.status).toBe(CONNECTIVITY_STATUS.Online);
      expect(statuses).toEqual([CONNECTIVITY_STATUS.Offline, CONNECTIVITY_STATUS.Online]);
      expect(container.demoControls.network).toBe(container.controls.network);
      observation.unsubscribe();
    });

    it('is the same switch that cuts the repositories, so one control drives the whole app', async () => {
      const { container } = await aContainer();
      const observation = await container.useCases.observeConnectivity.execute(() => undefined);
      await firstMeetingOf(container, MEETING_PERIOD.Upcoming);

      container.demoControls.network.setOnline(false);
      const offline = await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      const later = await container.useCases.observeConnectivity.execute(() => undefined);

      expect(valueOf(offline).source.freshness).toBe(FRESHNESS.Stale);
      expect(later.status).toBe(CONNECTIVITY_STATUS.Offline);
      later.unsubscribe();
      observation.unsubscribe();
    });
  });

  it('reports what the use cases swallow to the monitoring it was given', async () => {
    const monitoring = new FakeMonitoring();
    const container = valueOf(await createContainer(mock(), silentRuntime({ monitoring })));
    const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
    await container.useCases.getMeeting.execute({ meetingId: upcoming.id });
    container.controls.network.setOnline(false);

    await container.useCases.getMeeting.execute({ meetingId: upcoming.id });

    expect(monitoring.loggedEvents()).toContain('servedFromCache');
  });

  it('answers mockDataInvalid, not an exception, when the clock leaves no room for the seed', async () => {
    const clock = new FakeClock(unwrap(parseInstant(1000)));

    const created = await createContainer(mock(), silentRuntime({ clock }));

    expect(created.ok).toBe(false);
    expect(!created.ok && created.error.code).toBe(CONTAINER_ERROR_CODE.MockDataInvalid);
  });

  it('answers mockDataInvalid when the session of the demo user cannot be opened', async () => {
    const clock = new FakeClock(unwrap(parseInstant(8_640_000_000_000_000)));

    const created = await createContainer(mock(), silentRuntime({ clock }));

    expect(!created.ok && created.error.code).toBe(CONTAINER_ERROR_CODE.MockDataInvalid);
  });
});

const DEVELOPMENT = { development: true };

/** The raw settings of the environment, for the mock adapters. */
const MOCK_SETTINGS = { adapters: ADAPTERS.Mock, apiBaseUrl: undefined } as const;

describe('createContainer, mock configuration, the biometrics', () => {
  async function onDevice(device: { platform: DevicePlatform }): Promise<MockContainer> {
    const created = await createContainer(
      mock(),
      silentRuntime({
        platform: device.platform,
        biometricPromptText: (reason) => ({ message: `prompt:${reason}`, cancelLabel: 'cancel' }),
      }),
    );
    if (!created.ok)
      throw new Error(`The container was not built: ${JSON.stringify(created.error)}`);
    return created.value;
  }

  async function castOne(container: MockContainer) {
    const { meeting, resolution } = await anOpenResolution(container);
    return container.useCases.castVote.execute({
      meetingId: meeting.id,
      resolutionId: resolution.id,
      choice: VOTE_CHOICE.For,
    });
  }

  it('shows the prompt of the device on the unlock and on the vote when a finger or a face is enrolled', async () => {
    const device = aDeviceWithBiometrics();
    const container = await onDevice(device);

    valueOf(await container.useCases.unlockApp.execute());
    valueOf(await castOne(container));

    expect(device.biometrics.prompts).toEqual([
      `prompt:${BIOMETRIC_REASON.UnlockApp}`,
      `prompt:${BIOMETRIC_REASON.ConfirmVote}`,
    ]);
  });

  it.each([
    ['nothing is enrolled', { enrolled: false }],
    ['the device has no biometric hardware', { hardware: false }],
  ])('recognises the user without a prompt when %s', async (_name, overrides) => {
    const device = aDeviceWithBiometrics(overrides);
    const container = await onDevice(device);

    expect(isOk(await container.useCases.unlockApp.execute())).toBe(true);
    expect(isOk(await castOne(container))).toBe(true);
    expect(device.biometrics.prompts).toEqual([]);
  });

  it('recognises the user without a prompt when the device cannot be asked', async () => {
    const device = aDeviceWithBiometrics();
    device.platform.localAuthentication.hasHardware = () => Promise.reject(new Error('no module'));
    const container = await onDevice(device);

    expect(isOk(await container.useCases.unlockApp.execute())).toBe(true);
    expect(device.biometrics.prompts).toEqual([]);
  });

  it('recognises the user without a prompt when it is handed no platform', async () => {
    const { container } = await aContainer();

    expect(isOk(await container.useCases.unlockApp.execute())).toBe(true);
    expect(isOk(await castOne(container))).toBe(true);
  });
});

describe('createContainer, mock configuration, a vote recorded while the user signs out', () => {
  /**
   * The mock adapters, wired by hand so that the cache of meetings is a slow one: the use cases
   * are the ones of the container, on the same adapters, signed in as the first demo account.
   */
  async function slowCache() {
    const wiring = valueOf(await createMockPorts(mock({ startSignedIn: false }), silentRuntime()));
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
    const session = valueOf(
      await useCases.signIn.execute({ email: ALICE, password: DEMO_PASSWORD }),
    );
    return { cache, controls: wiring.controls, useCases, owner: session.user.id };
  }

  const cachedCopy = async (
    world: Awaited<ReturnType<typeof slowCache>>,
    meeting: { readonly id: Parameters<HoldingMeetingCache['readMeeting']>[1] },
  ) => valueOf(await world.cache.readMeeting(world.owner, meeting.id));

  it('does not put the meeting of the user who left back in the cache once the vote is submitted', async () => {
    const world = await slowCache();
    const { meeting, resolution } = await anOpenResolution(world);
    expect(await cachedCopy(world, meeting)).toBeDefined();
    const read = world.cache.holdNextRead();

    const casting = world.useCases.castVote.execute({
      meetingId: meeting.id,
      resolutionId: resolution.id,
      choice: VOTE_CHOICE.For,
    });
    await read.hasAnswered;
    valueOf(await world.useCases.signOut.execute());
    expect(await cachedCopy(world, meeting)).toBeUndefined();
    read.release();

    expect(valueOf(await casting).status).toBe(CAST_VOTE_STATUS.Submitted);
    expect(await cachedCopy(world, meeting)).toBeUndefined();
  });

  it('does not put it back either when the vote was queued and a synchronisation sends it', async () => {
    const world = await slowCache();
    const { meeting, resolution } = await anOpenResolution(world);
    world.controls.network.setOnline(false);
    const queued = valueOf(
      await world.useCases.castVote.execute({
        meetingId: meeting.id,
        resolutionId: resolution.id,
        choice: VOTE_CHOICE.For,
      }),
    );
    expect(queued.status).toBe(CAST_VOTE_STATUS.Queued);
    world.controls.network.setOnline(true);
    const read = world.cache.holdNextRead();

    const syncing = world.useCases.syncPendingVotes.execute();
    await read.hasAnswered;
    valueOf(await world.useCases.signOut.execute());
    expect(await cachedCopy(world, meeting)).toBeUndefined();
    read.release();

    expect(valueOf(await syncing).outcome).toBeDefined();
    expect(await cachedCopy(world, meeting)).toBeUndefined();
  });
});

describe('startContainer', () => {
  it('builds the mock container when the setting is missing in a development build', async () => {
    const created = await startContainer(
      { adapters: undefined, apiBaseUrl: undefined },
      DEVELOPMENT,
      silentRuntime(),
    );

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });

  it('builds the mock container when the setting says mock', async () => {
    const created = await startContainer(
      { ...MOCK_SETTINGS, adapters: ' Mock ' },
      DEVELOPMENT,
      silentRuntime(),
    );

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });

  it('starts the mock container signed out unless it is told to start signed in', async () => {
    const signedOut = valueOf(await startContainer(MOCK_SETTINGS, DEVELOPMENT, silentRuntime()));
    const signedIn = valueOf(
      await startContainer(
        { ...MOCK_SETTINGS, mockStartsSignedIn: true },
        DEVELOPMENT,
        silentRuntime(),
      ),
    );

    expect(valueOf(await signedOut.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.None,
    );
    expect(valueOf(await signedIn.useCases.restoreSession.execute()).status).toBe(
      SESSION_RESTORE.UnlockRequired,
    );
  });

  it('reports a value it does not know instead of guessing', async () => {
    const created = await startContainer(
      { ...MOCK_SETTINGS, adapters: 'mokc' },
      DEVELOPMENT,
      silentRuntime(),
    );

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'mokc' },
    });
  });

  it('refuses to start without a setting outside of a development build, instead of starting the mock adapters', async () => {
    const created = await startContainer(
      { adapters: undefined, apiBaseUrl: undefined },
      { development: false },
      silentRuntime(),
    );

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.MissingAdaptersSetting },
    });
  });

  it('starts the mock adapters outside of a development build when the setting says so', async () => {
    const created = await startContainer(MOCK_SETTINGS, { development: false }, silentRuntime());

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });

  it('reports the address of the API that http needs before it builds anything', async () => {
    const created = await startContainer(
      { adapters: ADAPTERS.Http, apiBaseUrl: undefined },
      DEVELOPMENT,
      silentRuntime(),
    );

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.MissingApiBaseUrl },
    });
  });
});
