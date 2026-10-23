import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@core/domain/errors/AuthenticationError';
import { storageReadFailed, storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import {
  MILLIS_PER_HOUR,
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aSession,
  aUser,
  aUserId,
  at,
} from '@testing/domain/builders';

import { AppLock } from './AppLock';
import { requireSameUser, requireSession } from './requireSession';

type Fakes = ReturnType<typeof createFakes>;

async function fillCaches(fakes: Fakes) {
  await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
  await fakes.documentCache.save(
    aUserId(),
    { document: aDocument(), location: aDocumentLocation() },
    NOW,
  );
}

describe('requireSession', () => {
  it('returns the session of the signed-in user', async () => {
    expect(await requireSession(createFakes())).toEqual(ok(aSession()));
  });

  it('fails with notAuthenticated when nobody is signed in', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    expect(await requireSession(fakes)).toEqual(err(notAuthenticated()));
  });

  it('fails with sessionExpired once the expiry is reached, the instant itself included', async () => {
    const fakes = createFakes();
    fakes.auth.session = aSession({ expiresAt: NOW });

    expect(await requireSession(fakes)).toEqual(err(sessionExpired()));
  });

  it('accepts a session until its last millisecond', async () => {
    const fakes = createFakes();
    fakes.auth.session = aSession({ expiresAt: at(1) });

    expect(await requireSession(fakes)).toEqual(ok(aSession({ expiresAt: at(1) })));
  });

  it('returns the storage error when the session cannot be read', async () => {
    const fakes = createFakes();
    fakes.auth.readFailure = storageReadFailed();

    expect(await requireSession(fakes)).toEqual(err(storageReadFailed()));
  });

  describe('when the app is locked', () => {
    it('fails with appLocked, though the session is valid', async () => {
      const fakes = { ...createFakes(), appLock: new AppLock() };

      expect(await requireSession(fakes)).toEqual(err(appLocked()));
    });

    it('serves the user again once the app is unlocked', async () => {
      const fakes = { ...createFakes(), appLock: new AppLock() };
      fakes.appLock.unlock();

      expect(await requireSession(fakes)).toEqual(ok(aSession()));
    });

    it('says first that nobody is signed in, or that the session expired, which is more to the point', async () => {
      const fakes = { ...createFakes(), appLock: new AppLock() };
      fakes.auth.session = undefined;
      expect(await requireSession(fakes)).toEqual(err(notAuthenticated()));

      fakes.auth.session = aSession({ expiresAt: NOW });
      expect(await requireSession(fakes)).toEqual(err(sessionExpired()));
    });
  });

  describe('when the session has expired', () => {
    it('empties both caches, for every owner, and still answers sessionExpired', async () => {
      const fakes = createFakes();
      await fillCaches(fakes);
      await fakes.meetingCache.saveMeeting(aUserId('user-2'), aMeeting(), NOW);
      fakes.clock.advance(MILLIS_PER_HOUR);

      expect(await requireSession(fakes)).toEqual(err(sessionExpired()));

      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.documentCache.isEmpty()).toBe(true);
    });

    it('captures a purge that fails, and still answers sessionExpired', async () => {
      const fakes = createFakes();
      await fillCaches(fakes);
      fakes.meetingCache.purgeFailure = storageWriteFailed();
      fakes.clock.advance(MILLIS_PER_HOUR);

      expect(await requireSession(fakes)).toEqual(err(sessionExpired()));

      expect(fakes.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.CachePurgeFailed]);
    });

    it('leaves the caches alone while the session is valid, signed out, or locked', async () => {
      const fakes = createFakes();
      await fillCaches(fakes);

      await requireSession(fakes);
      fakes.auth.session = undefined;
      await requireSession(fakes);
      fakes.auth.session = aSession();
      fakes.appLock.lock();
      await requireSession(fakes);

      expect(fakes.meetingCache.isEmpty()).toBe(false);
      expect(fakes.documentCache.isEmpty()).toBe(false);
    });
  });
});

describe('requireSameUser', () => {
  const OTHER = aSession({ user: aUser({ id: aUserId('user-2') }) });

  it('returns the session when the expected user is the one signed in', async () => {
    expect(await requireSameUser(createFakes(), aUserId())).toEqual(ok(aSession()));
  });

  it('fails with sessionChanged when somebody else is signed in', async () => {
    const fakes = createFakes();
    fakes.auth.session = OTHER;

    expect(await requireSameUser(fakes, aUserId())).toEqual(err(sessionChanged()));
  });

  it.each([
    ['nobody is signed in', (fakes: Fakes) => (fakes.auth.session = undefined), notAuthenticated()],
    [
      'the session expired',
      (fakes: Fakes) => fakes.clock.advance(MILLIS_PER_HOUR),
      sessionExpired(),
    ],
    ['the app is locked', (fakes: Fakes) => fakes.appLock.lock(), appLocked()],
  ])('fails like the guard when %s', async (_name, change, expected) => {
    const fakes = createFakes();
    change(fakes);

    expect(await requireSameUser(fakes, aUserId())).toEqual(err(expected));
  });
});
