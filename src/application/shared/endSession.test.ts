import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { err } from '@domain/shared/Result';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aSession,
  aUser,
  aUserId,
} from '@domain/testing/builders';

import { LOG_ATTRIBUTE, MONITORING_EVENT } from '../ports/Monitoring';
import { createFakes } from '../testing/createFakes';

import { closeSession, endRefusedSession } from './endSession';

const ALICE = aUserId('user-1');
const BRUNO = aUserId('user-2');

async function fill(fakes: ReturnType<typeof createFakes>) {
  await fakes.meetingCache.saveMeeting(ALICE, aMeeting(), NOW);
  await fakes.documentCache.save(
    ALICE,
    { document: aDocument(), location: aDocumentLocation() },
    NOW,
  );
}

describe('closeSession', () => {
  it('locks the app, empties both caches and forgets the session', async () => {
    const fakes = createFakes();
    await fill(fakes);

    const closed = await closeSession(fakes);

    expect(closed.ok).toBe(true);
    expect(fakes.appLock.isLocked()).toBe(true);
    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(fakes.auth.session).toBeUndefined();
  });

  it('gives the failure of the storage that cannot forget the session', async () => {
    const fakes = createFakes();
    fakes.auth.signOutFailure = storageWriteFailed();

    expect(await closeSession(fakes)).toEqual(err(storageWriteFailed()));
    expect(fakes.appLock.isLocked()).toBe(true);
  });
});

describe('endRefusedSession', () => {
  it('ends the session of the user whose token the server refused', async () => {
    const fakes = createFakes();
    await fill(fakes);

    await endRefusedSession(fakes, ALICE);

    expect(fakes.auth.signOutCalls).toBe(1);
    expect(fakes.auth.session).toBeUndefined();
    expect(fakes.appLock.isLocked()).toBe(true);
    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(fakes.monitoring.errors).toEqual([]);
  });

  it('leaves alone the session of somebody else, who signed in while the request was on its way', async () => {
    const fakes = createFakes();
    fakes.auth.session = aSession({ user: aUser({ id: BRUNO }) });
    await fill(fakes);

    await endRefusedSession(fakes, ALICE);

    expect(fakes.auth.signOutCalls).toBe(0);
    expect(fakes.auth.session).toBeDefined();
    expect(fakes.appLock.isLocked()).toBe(false);
    expect(fakes.meetingCache.isEmpty()).toBe(false);
  });

  it('does nothing when nobody is signed in any more', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    await endRefusedSession(fakes, ALICE);

    expect(fakes.auth.signOutCalls).toBe(0);
  });

  it('ends the session even when it cannot be read: it is the one the server refused, as far as anyone can tell', async () => {
    const fakes = createFakes();
    fakes.auth.readFailure = storageReadFailed();

    await endRefusedSession(fakes, ALICE);

    expect(fakes.auth.signOutCalls).toBe(1);
    expect(fakes.appLock.isLocked()).toBe(true);
  });

  it('captures a session that cannot be forgotten, and does not fail', async () => {
    const fakes = createFakes();
    fakes.auth.signOutFailure = storageWriteFailed('keychain locked');

    await expect(endRefusedSession(fakes, ALICE)).resolves.toBeUndefined();

    expect(fakes.monitoring.errors).toEqual([
      {
        event: MONITORING_EVENT.SignOutFailed,
        error: storageWriteFailed('keychain locked'),
        attributes: { [LOG_ATTRIBUTE.UserId]: ALICE },
      },
    ]);
    expect(fakes.appLock.isLocked()).toBe(true);
  });
});
