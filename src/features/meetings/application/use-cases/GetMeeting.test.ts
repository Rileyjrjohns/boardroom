import { CACHE_RESOURCE } from '@core/application/offline/CacheResource';
import { FRESHNESS } from '@core/application/offline/Loaded';
import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { notAuthenticated, sessionExpired } from '@features/auth/domain/errors/AuthenticationError';
import {
  forbidden,
  networkUnavailable,
  notFound,
  unauthorized,
} from '@core/domain/errors/RepositoryError';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { SignOut } from '@features/auth/application/use-cases/SignOut';
import { createFakes } from '@testing/application/createFakes';
import {
  MILLIS_PER_DAY,
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aMeetingId,
  aSession,
  aUser,
  aUserId,
  anEmail,
  at,
} from '@testing/domain/builders';

import { GetMeeting } from './GetMeeting';

const MEETING = aMeeting();
const MEETING_ATTRIBUTES = {
  [LOG_ATTRIBUTE.MeetingId]: aMeetingId(),
  [LOG_ATTRIBUTE.Resource]: CACHE_RESOURCE.Meeting,
};

function setup() {
  const fakes = createFakes();
  fakes.meetings.addMeeting(MEETING);
  return { fakes, useCase: new GetMeeting(fakes) };
}

function signInAsB(fakes: ReturnType<typeof createFakes>) {
  fakes.auth.session = aSession({
    user: aUser({ id: aUserId('user-B'), email: anEmail('b@example.com') }),
  });
}

describe('GetMeeting', () => {
  it('returns the meeting from the server, flagged fresh, and caches it for the signed-in user', async () => {
    const { fakes, useCase } = setup();

    const result = await useCase.execute({ meetingId: aMeetingId() });

    expect(result).toEqual(
      ok({ data: MEETING, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
    );
    expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(
      ok({ value: MEETING, cachedAt: NOW }),
    );
  });

  describe('the session', () => {
    it('is required: without one nothing is read, not even from the cache', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.auth.session = undefined;
      fakes.network.goOffline();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(notAuthenticated()));
      expect(fakes.meetings.getCalls).toHaveLength(1);
    });

    it('must not have expired', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: NOW });

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(sessionExpired()));
      expect(fakes.meetings.getCalls).toEqual([]);
    });
  });

  describe('the offline policy', () => {
    it('logs that a cached meeting was served, with the id of the meeting', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.network.goOffline();

      await useCase.execute({ meetingId: aMeetingId() });

      expect(fakes.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Info,
          event: MONITORING_EVENT.ServedFromCache,
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
    });

    it('serves the cached meeting flagged stale when there is no network', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.network.goOffline();
      fakes.clock.advance(1_800_000);

      const result = await useCase.execute({ meetingId: aMeetingId() });

      expect(result).toEqual(
        ok({
          data: MEETING,
          source: { freshness: FRESHNESS.Stale, cachedAt: NOW },
          loadedAt: at(1_800_000),
        }),
      );
    });

    it('returns the network error for a meeting that was never viewed', async () => {
      const { fakes, useCase } = setup();
      fakes.network.goOffline();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
    });

    it('returns the fresh meeting when the cache cannot be written', async () => {
      const { fakes, useCase } = setup();
      fakes.meetingCache.writeFailure = storageWriteFailed();

      const result = await useCase.execute({ meetingId: aMeetingId() });

      expect(result).toEqual(
        ok({ data: MEETING, source: { freshness: FRESHNESS.Fresh }, loadedAt: NOW }),
      );
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheWriteFailed,
          error: storageWriteFailed(),
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
    });

    it('returns the network error when the cache cannot be read either', async () => {
      const { fakes, useCase } = setup();
      fakes.network.goOffline();
      fakes.meetingCache.readFailure = storageReadFailed();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheReadFailed,
          error: storageReadFailed(),
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
    });

    it('refuses a cached meeting older than the maximum age, and one dated in the future', async () => {
      const { fakes, useCase } = setup();
      fakes.auth.session = aSession({ expiresAt: at(30 * MILLIS_PER_DAY) });
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.network.goOffline();

      fakes.clock.advance(7 * MILLIS_PER_DAY);
      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(
        ok({
          data: MEETING,
          source: { freshness: FRESHNESS.Stale, cachedAt: NOW },
          loadedAt: at(7 * MILLIS_PER_DAY),
        }),
      );
      fakes.clock.advance(1);
      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));

      fakes.clock.set(at(-1));
      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
    });
  });

  describe('a user who is not the one who cached the meeting', () => {
    it('finds nothing of it, even offline: A views a meeting, B signs in without any sign-out in between', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      signInAsB(fakes);
      fakes.network.goOffline();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
    });

    it('finds nothing of it after A signed out and B signed in: the sign-out emptied the cache', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      await new SignOut(fakes).execute();
      signInAsB(fakes);
      fakes.appLock.unlock();
      fakes.network.goOffline();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('empties the copy of A too when B is refused by the server: the refusal of a session empties the caches of every owner', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      signInAsB(fakes);
      fakes.meetings.failure = unauthorized();
      await useCase.execute({ meetingId: aMeetingId() });

      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));
    });
  });

  describe('an authoritative refusal of the server', () => {
    it('evicts the cached copy when the user is refused, and the copy is not served afterwards', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.meetings.failure = unauthorized();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(unauthorized()));
      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));

      fakes.meetings.failure = undefined;
      // The refused session is over: the user signs in again, and finds no saved copy.
      fakes.auth.session = aSession();
      fakes.appLock.unlock();
      fakes.network.goOffline();
      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(networkUnavailable()));
    });

    it('evicts the cached copy when the meeting no longer exists', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.meetings.removeMeeting(aMeetingId());

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(notFound()));
      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));
    });

    it('evicts the cached copy when the meeting is forbidden to the user, the documents it lists with it', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      await fakes.documentCache.save(
        aUserId(),
        { document: MEETING.documents[0] ?? aDocument(), location: aDocumentLocation() },
        NOW,
      );
      fakes.meetings.forbid(aMeetingId());

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(forbidden()));
      expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));
      expect(fakes.documentCache.isEmpty()).toBe(true);
    });

    it('empties both caches, and captures the failure, when the copy cannot be evicted', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.meetings.forbid(aMeetingId());
      fakes.meetingCache.removeFailure = storageWriteFailed();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(forbidden()));
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheRemoveFailed,
          error: storageWriteFailed(),
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('captures the failure when the cached copy cannot be read to find the documents it lists', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.meetings.forbid(aMeetingId());
      fakes.meetingCache.readFailure = storageReadFailed();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(forbidden()));
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheRemoveFailed,
          error: storageReadFailed(),
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
    });

    it('captures the failure when a document that the refused meeting lists cannot be removed', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      await fakes.documentCache.save(
        aUserId(),
        { document: MEETING.documents[0] ?? aDocument(), location: aDocumentLocation() },
        NOW,
      );
      fakes.meetings.forbid(aMeetingId());
      fakes.documentCache.removeFailure = storageWriteFailed();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(forbidden()));
      expect(fakes.monitoring.errors).toEqual([
        {
          event: MONITORING_EVENT.CacheRemoveFailed,
          error: storageWriteFailed(),
          attributes: MEETING_ATTRIBUTES,
        },
      ]);
    });

    it('captures the failure of the purge when the session is refused and the caches cannot be emptied', async () => {
      const { fakes, useCase } = setup();
      await useCase.execute({ meetingId: aMeetingId() });
      fakes.meetings.failure = unauthorized();
      fakes.meetingCache.purgeFailure = storageWriteFailed();

      expect(await useCase.execute({ meetingId: aMeetingId() })).toEqual(err(unauthorized()));
      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });
  });
});
