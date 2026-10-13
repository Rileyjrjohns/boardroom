import { SESSION_RESTORE } from '@application/use-cases/auth/RestoreSession';
import { FRESHNESS } from '@application/shared/Loaded';
import { CAST_VOTE_STATUS } from '@application/use-cases/votes/CastVote';
import { SYNC_OUTCOME } from '@application/use-cases/votes/SyncPendingVotes';
import { FakeClock } from '@application/testing/FakeClock';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { CONFIDENTIALITY_LEVEL } from '@domain/entities/Document';
import { findResolution } from '@domain/entities/Meeting';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';
import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { VOTE_DELIVERY_ERROR_CODE } from '@domain/errors/VoteDeliveryError';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import { isOk } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';
import { MILLIS_PER_DAY, NOW, aDuration, unwrap } from '@domain/testing/builders';
import { parseInstant } from '@domain/value-objects/Instant';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';
import { createPageRequest } from '@domain/value-objects/PageRequest';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import { DEMO_PASSWORD } from '@infrastructure/in-memory/seed';
import { immediateSleep, recordingSleep } from '@infrastructure/testing/sleep';

import { ADAPTERS } from './adapters';
import { MEETINGS_PAGE_SIZE } from './config';
import { defaultMockConfiguration } from './configuration';
import type { MockConfiguration } from './configuration';
import type { ContainerRuntime } from './ContainerRuntime';
import { createContainer, startContainer } from './createContainer';
import type { MockContainer } from './createContainer';
import { CONTAINER_ERROR_CODE } from './errors';

/**
 * What the container reads from the outside, replaced: a clock that stands still, a network that
 * does not wait, and a monitoring that writes nowhere, so that a test prints nothing to the console.
 */
const silentRuntime = (overrides: ContainerRuntime = {}): ContainerRuntime => ({
  clock: new FakeClock(),
  sleep: immediateSleep,
  monitoring: new FakeMonitoring(),
  ...overrides,
});

const ALICE = 'alice.martin@boardroom.example';
const BRUNO = 'bruno.durand@boardroom.example';

function mock(overrides: Partial<MockConfiguration> = {}): MockConfiguration {
  return { ...defaultMockConfiguration(), latency: aDuration(0), ...overrides };
}

/** A mock container that does not wait and whose clock stands still. */
function aContainer(config: MockConfiguration = mock()): {
  container: MockContainer;
  clock: FakeClock;
} {
  const clock = new FakeClock();
  const created = createContainer(config, silentRuntime({ clock }));
  if (!created.ok) throw new Error(`The container was not built: ${JSON.stringify(created.error)}`);
  return { container: created.value, clock };
}

const page = unwrap(createPageRequest({ limit: MEETINGS_PAGE_SIZE }));

async function firstMeetingOf(container: MockContainer, period: MeetingPeriod) {
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
async function anOpenResolution(container: MockContainer) {
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
  it('builds a container with the use cases, the settings of the screens and the controls', () => {
    const { container } = aContainer();

    expect(container.kind).toBe(ADAPTERS.Mock);
    expect(Object.keys(container.useCases).sort()).toEqual(
      [
        'acknowledgeRejectedVote',
        'castVote',
        'closeDocument',
        'evaluateAppLock',
        'getMeeting',
        'listMeetings',
        'listPendingVotes',
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

  it('serves meetings from the first use case to the detail, using only the container', async () => {
    const { container } = aContainer();

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
    const { container } = aContainer();
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

  it('generates its content from the clock it is given', async () => {
    const created = createContainer(mock(), silentRuntime({ clock: new FakeClock(NOW) }));
    const container = valueOf(created);

    const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);

    expect(upcoming.scheduledAt - NOW).toBeLessThan(5 * MILLIS_PER_DAY);
  });

  it('starts with the demo user signed in, behind the named option', async () => {
    const { container } = aContainer(mock({ startSignedIn: true }));

    const restored = valueOf(await container.useCases.restoreSession.execute());

    expect(restored.status).toBe(SESSION_RESTORE.UnlockRequired);
  });

  it('starts signed out when the option is off, and the demo accounts then sign in', async () => {
    const { container } = aContainer(mock({ startSignedIn: false }));
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
    const { container } = aContainer(mock({ startSignedIn: false }));

    const refused = await container.useCases.signIn.execute({ email: ALICE, password: 'nope' });

    expect(!refused.ok && refused.error.code).toBe(AUTHENTICATION_ERROR_CODE.InvalidCredentials);
  });

  it('gives the two demo users different lists of meetings', async () => {
    const { container } = aContainer(mock({ startSignedIn: false }));
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
    const { container } = aContainer();
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
    const { container } = aContainer();
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
      const { container } = aContainer(mock({ startSignedIn: true }));

      const listed = await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(listed.ok).toBe(true);
    });

    it('is closed by the restore of the session, for every use case, until the biometrics succeed', async () => {
      const { container } = aContainer();
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
      const { container } = aContainer(mock({ startSignedIn: false }));
      await container.useCases.signIn.execute({ email: ALICE, password: DEMO_PASSWORD });

      expect((await container.useCases.listPendingVotes.execute()).ok).toBe(true);
    });
  });

  describe('single shared instances', () => {
    it('shares the screen protection coordinator: closing one view of two leaves the screen protected', async () => {
      const { container } = aContainer();
      const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
      const meeting = valueOf(
        await container.useCases.getMeeting.execute({ meetingId: upcoming.id }),
      ).data;
      const confidential = meeting.documents.find(
        ({ confidentiality }) => confidentiality === CONFIDENTIALITY_LEVEL.Confidential,
      );
      if (confidential === undefined) throw new Error('The meeting has no confidential document.');
      const { screenProtection } = container.controls;
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
      const { container } = aContainer();
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
      const { screenProtection } = container.controls;
      await container.useCases.openDocument.execute({ documentId: first.id });
      await container.useCases.openDocument.execute({ documentId: second.id });

      await container.useCases.closeDocument.execute({ documentId: first.id });
      expect(screenProtection.isEnabled()).toBe(true);

      await container.useCases.closeDocument.execute({ documentId: second.id });
      expect(screenProtection.isEnabled()).toBe(false);
    });

    it('shares CastVote: a second vote on the same resolution cast at the same time is refused', async () => {
      const { container } = aContainer();
      const { meeting, resolution } = await anOpenResolution(container);
      const input = { meetingId: meeting.id, resolutionId: resolution.id, choice: VOTE_CHOICE.For };

      const first = container.useCases.castVote.execute(input);
      const second = await container.useCases.castVote.execute(input);

      expect(!second.ok && second.error.code).toBe(VOTE_DELIVERY_ERROR_CODE.InProgress);
      expect((await first).ok).toBe(true);
    });

    it('shares SyncPendingVotes: a second run during a run does nothing', async () => {
      const { container } = aContainer();

      const first = container.useCases.syncPendingVotes.execute();
      const second = container.useCases.syncPendingVotes.execute();

      expect(valueOf(await second).outcome).toBe(SYNC_OUTCOME.AlreadyRunning);
      expect(valueOf(await first).outcome).toBe(SYNC_OUTCOME.Completed);
    });

    it('gives each container its own server, caches and outbox: nothing is shared between two', async () => {
      const first = aContainer().container;
      const second = aContainer().container;
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
      const { container } = aContainer();
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
      const { container } = aContainer();
      container.controls.network.setOnline(false);

      const result = await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(!result.ok && result.error.code).toBe(REPOSITORY_ERROR_CODE.NetworkUnavailable);
    });

    it('queues a vote cast offline, and sends it when the network is back', async () => {
      const { container } = aContainer();
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
      const created = createContainer(mock({ latency: aDuration(250) }), silentRuntime({ sleep }));
      const container = valueOf(created);

      await container.useCases.listMeetings.execute({
        period: MEETING_PERIOD.Upcoming,
        request: page,
      });

      expect(requested).toEqual([250]);
      expect(container.controls.network.latency).toBe(250);
    });
  });

  it('reports what the use cases swallow to the monitoring it was given', async () => {
    const monitoring = new FakeMonitoring();
    const container = valueOf(createContainer(mock(), silentRuntime({ monitoring })));
    const upcoming = await firstMeetingOf(container, MEETING_PERIOD.Upcoming);
    await container.useCases.getMeeting.execute({ meetingId: upcoming.id });
    container.controls.network.setOnline(false);

    await container.useCases.getMeeting.execute({ meetingId: upcoming.id });

    expect(monitoring.loggedEvents()).toContain('servedFromCache');
  });

  it('answers mockDataInvalid, not an exception, when the clock leaves no room for the seed', () => {
    const clock = new FakeClock(unwrap(parseInstant(1000)));

    const created = createContainer(mock(), silentRuntime({ clock }));

    expect(created.ok).toBe(false);
    expect(!created.ok && created.error.code).toBe(CONTAINER_ERROR_CODE.MockDataInvalid);
  });

  it('answers mockDataInvalid when the session of the demo user cannot be opened', () => {
    const clock = new FakeClock(unwrap(parseInstant(8_640_000_000_000_000)));

    const created = createContainer(mock(), silentRuntime({ clock }));

    expect(!created.ok && created.error.code).toBe(CONTAINER_ERROR_CODE.MockDataInvalid);
  });
});

describe('createContainer, http configuration', () => {
  it('says it is not available yet, and does not fall back to the mock configuration', () => {
    const created = createContainer({ kind: ADAPTERS.Http });

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.ConfigurationNotAvailable, adapters: ADAPTERS.Http },
    });
  });
});

const DEVELOPMENT = { development: true };

describe('startContainer', () => {
  it('builds the mock container when the setting is missing', () => {
    const created = startContainer(undefined, DEVELOPMENT, silentRuntime());

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });

  it('builds the mock container when the setting says mock', () => {
    const created = startContainer(' Mock ', DEVELOPMENT, silentRuntime());

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });

  it('reports that http is not available yet', () => {
    const created = startContainer('http', DEVELOPMENT);

    expect(!created.ok && created.error.code).toBe(CONTAINER_ERROR_CODE.ConfigurationNotAvailable);
  });

  it('reports a value it does not know instead of guessing', () => {
    const created = startContainer('mokc', DEVELOPMENT);

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.InvalidAdaptersSetting, received: 'mokc' },
    });
  });

  it('refuses to start without a setting outside of a development build, instead of starting the mock adapters', () => {
    const created = startContainer(undefined, { development: false }, silentRuntime());

    expect(created).toEqual({
      ok: false,
      error: { code: CONTAINER_ERROR_CODE.MissingAdaptersSetting },
    });
  });

  it('starts the mock adapters outside of a development build when the setting says so', () => {
    const created = startContainer('mock', { development: false }, silentRuntime());

    expect(created.ok && created.value.kind).toBe(ADAPTERS.Mock);
  });
});
