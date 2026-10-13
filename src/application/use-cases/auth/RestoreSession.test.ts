import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aSession,
  aUser,
  aUserId,
  at,
} from '@domain/testing/builders';

import { LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { createFakes } from '../../testing/createFakes';

import { RestoreSession, SESSION_RESTORE } from './RestoreSession';

async function fillCaches(fakes: ReturnType<typeof createFakes>) {
  await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
  await fakes.documentCache.save(
    aUserId(),
    { document: aDocument(), location: aDocumentLocation() },
    NOW,
  );
}

describe('RestoreSession', () => {
  describe('a stored session that is still valid', () => {
    it('is returned together with the requirement to unlock the app: a cold start always asks for the biometrics', async () => {
      const fakes = createFakes();

      expect(await new RestoreSession(fakes).execute()).toEqual(
        ok({ status: SESSION_RESTORE.UnlockRequired }),
      );
    });

    it('says nothing of who the user is before the unlock: no name, no email, no id', async () => {
      const fakes = createFakes();

      const restored = await new RestoreSession(fakes).execute();

      const text = JSON.stringify(restored);
      expect(text).not.toContain(aUser().fullName);
      expect(text).not.toContain(aUser().email);
      expect(text).not.toContain(aUser().id);
    });

    it('locks the app, even one that was unlocked: no use case serves anything until the biometrics succeed', async () => {
      const fakes = createFakes();
      expect(fakes.appLock.isLocked()).toBe(false);

      await new RestoreSession(fakes).execute();

      expect(fakes.appLock.isLocked()).toBe(true);
    });

    it('is not signed out and leaves the caches alone', async () => {
      const fakes = createFakes();
      await fillCaches(fakes);

      await new RestoreSession(fakes).execute();

      expect(fakes.auth.signOutCalls).toBe(0);
      expect(fakes.meetingCache.isEmpty()).toBe(false);
      expect(fakes.documentCache.isEmpty()).toBe(false);
      expect(fakes.monitoring.logs).toEqual([]);
    });

    it('asks to unlock even when the session was stored a moment ago: nothing says how long the app was away', async () => {
      const fakes = createFakes();
      fakes.auth.session = aSession({ expiresAt: at(1) });

      const result = await new RestoreSession(fakes).execute();

      expect(result.ok && result.value.status).toBe(SESSION_RESTORE.UnlockRequired);
    });
  });

  it('reports no session when nobody is signed in', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    expect(await new RestoreSession(fakes).execute()).toEqual(ok({ status: SESSION_RESTORE.None }));
    expect(fakes.auth.signOutCalls).toBe(0);
  });

  it('locks the app whatever it finds: a cold start proves nothing', async () => {
    const none = createFakes();
    none.auth.session = undefined;
    const expired = createFakes();
    expired.auth.session = aSession({ expiresAt: at(-1) });
    const unreadable = createFakes();
    unreadable.auth.readFailure = storageReadFailed();

    for (const fakes of [none, expired, unreadable]) {
      await new RestoreSession(fakes).execute();
      expect(fakes.appLock.isLocked()).toBe(true);
    }
  });

  describe('an expired session', () => {
    it.each([-1, 0])(
      'is signed out (expiry %p ms from now), and reported as no session',
      async (offset) => {
        const fakes = createFakes();
        fakes.auth.session = aSession({ expiresAt: at(offset) });

        expect(await new RestoreSession(fakes).execute()).toEqual(
          ok({ status: SESSION_RESTORE.None }),
        );
        expect(fakes.auth.signOutCalls).toBe(1);
        expect(fakes.auth.session).toBeUndefined();
        expect(fakes.monitoring.logs).toEqual([
          { level: LOG_LEVEL.Info, event: MONITORING_EVENT.SessionExpired, attributes: undefined },
        ]);
      },
    );

    it('has its caches emptied, so that what the user saw does not stay on the device', async () => {
      const fakes = createFakes();
      await fillCaches(fakes);
      fakes.auth.session = aSession({ expiresAt: at(-1) });

      await new RestoreSession(fakes).execute();

      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.documentCache.isEmpty()).toBe(true);
    });

    it('uses the clock of the port, not the real one', async () => {
      const fakes = createFakes();
      fakes.auth.session = aSession({ expiresAt: at(1000) });
      expect(await new RestoreSession(fakes).execute()).toEqual(
        ok({ status: SESSION_RESTORE.UnlockRequired }),
      );
      expect(fakes.auth.session).toEqual(aSession({ expiresAt: at(1000) }));

      fakes.clock.advance(1000);

      expect(await new RestoreSession(fakes).execute()).toEqual(
        ok({ status: SESSION_RESTORE.None }),
      );
      expect(fakes.auth.session).toBeUndefined();
    });

    it('is still reported as no session, and the failures are captured, when the caches and the sign-out fail', async () => {
      const fakes = createFakes();
      fakes.auth.session = aSession({ expiresAt: at(-1) });
      fakes.auth.signOutFailure = storageWriteFailed();
      fakes.meetingCache.purgeFailure = storageWriteFailed();

      expect(await new RestoreSession(fakes).execute()).toEqual(
        ok({ status: SESSION_RESTORE.None }),
      );
      expect(fakes.monitoring.errors.map(({ event }) => event)).toEqual([
        MONITORING_EVENT.CachePurgeFailed,
        MONITORING_EVENT.SignOutFailed,
      ]);
    });
  });

  it('returns the storage error when the session cannot be read', async () => {
    const fakes = createFakes();
    fakes.auth.readFailure = storageReadFailed();

    expect(await new RestoreSession(fakes).execute()).toEqual(err(storageReadFailed()));
  });
});
