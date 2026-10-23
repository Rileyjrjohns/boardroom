import { AUTHENTICATION_ERROR_CODE } from '@features/auth/domain/errors/AuthenticationError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { createFakes } from '@testing/application/createFakes';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aSession,
  aUser,
  aUserId,
  at,
} from '@testing/domain/builders';

import { AuthSessionGate } from './AuthSessionGate';

const ALICE = aUserId('user-1');
const BRUNO = aUserId('user-2');

function aGate() {
  const fakes = createFakes();
  return { fakes, gate: new AuthSessionGate(fakes) };
}

describe('AuthSessionGate', () => {
  describe('requireSameUser', () => {
    it('gives the id of the user who is signed in, when it is the one expected and the app is open', async () => {
      const { gate } = aGate();

      const answer = await gate.requireSameUser(aUserId());

      expect(answer).toEqual({ ok: true, value: aUserId() });
    });

    it('refuses with sessionChanged when somebody else is signed in, and the session is not kept', async () => {
      const { gate } = aGate();

      const answer = await gate.requireSameUser(BRUNO);

      expect(answer).toEqual({
        ok: false,
        error: { error: { code: AUTHENTICATION_ERROR_CODE.SessionChanged }, sessionKept: false },
      });
    });

    it('refuses with notAuthenticated when nobody is signed in', async () => {
      const { fakes, gate } = aGate();
      fakes.auth.session = undefined;

      const answer = await gate.requireSameUser(ALICE);

      expect(answer).toEqual({
        ok: false,
        error: { error: { code: AUTHENTICATION_ERROR_CODE.NotAuthenticated }, sessionKept: false },
      });
    });

    it('refuses with sessionExpired when the session has expired, and empties what it left', async () => {
      const { fakes, gate } = aGate();
      fakes.auth.session = aSession({ expiresAt: at(-1) });
      await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);

      const answer = await gate.requireSameUser(aUserId());

      expect(answer).toEqual({
        ok: false,
        error: { error: { code: AUTHENTICATION_ERROR_CODE.SessionExpired }, sessionKept: false },
      });
      expect(fakes.meetingCache.isEmpty()).toBe(true);
    });

    it('refuses with appLocked when the app is locked, and says the session is kept: the user comes back', async () => {
      const { fakes, gate } = aGate();
      fakes.appLock.lock();

      const answer = await gate.requireSameUser(aUserId());

      expect(answer).toEqual({
        ok: false,
        error: { error: { code: AUTHENTICATION_ERROR_CODE.AppLocked }, sessionKept: true },
      });
    });

    it('refuses with the failure of the storage that cannot read the session, which is not kept', async () => {
      const { fakes, gate } = aGate();
      fakes.auth.readFailure = storageReadFailed();

      const answer = await gate.requireSameUser(aUserId());

      expect(answer).toEqual({
        ok: false,
        error: { error: storageReadFailed(), sessionKept: false },
      });
    });
  });

  describe('endRefusedSession', () => {
    it('ends the session of the user whose token the server refused: locks, empties, forgets', async () => {
      const { fakes, gate } = aGate();
      await fakes.meetingCache.saveMeeting(ALICE, aMeeting(), NOW);

      await gate.endRefusedSession(aUserId());

      expect(fakes.appLock.isLocked()).toBe(true);
      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.auth.session).toBeUndefined();
    });

    it('leaves alone the session of somebody else, who signed in while the request was on its way', async () => {
      const { fakes, gate } = aGate();
      fakes.auth.session = aSession({ user: aUser({ id: BRUNO }) });

      await gate.endRefusedSession(ALICE);

      expect(fakes.auth.session).toBeDefined();
      expect(fakes.appLock.isLocked()).toBe(false);
    });
  });

  describe('purgeSessionData', () => {
    it('empties what the session left on the device, for every owner, and keeps the session', async () => {
      const { fakes, gate } = aGate();
      await fakes.meetingCache.saveMeeting(ALICE, aMeeting(), NOW);
      await fakes.documentCache.save(
        BRUNO,
        { document: aDocument(), location: aDocumentLocation() },
        NOW,
      );

      await gate.purgeSessionData();

      expect(fakes.meetingCache.isEmpty()).toBe(true);
      expect(fakes.documentCache.isEmpty()).toBe(true);
      expect(fakes.auth.session).toBeDefined();
    });
  });
});
