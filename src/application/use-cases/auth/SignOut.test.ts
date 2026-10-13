import { storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aDocument,
  aDocumentLocation,
  aMeeting,
  aMeetingId,
  aPendingVote,
  aSession,
  aUserId,
} from '@domain/testing/builders';

import { MONITORING_EVENT } from '../../ports/Monitoring';
import { createFakes } from '../../testing/createFakes';

import { SignOut } from './SignOut';

async function fillCaches(fakes: ReturnType<typeof createFakes>) {
  await fakes.meetingCache.saveMeeting(aUserId(), aMeeting(), NOW);
  await fakes.documentCache.save(
    aUserId(),
    { document: aDocument(), location: aDocumentLocation() },
    NOW,
  );
}

describe('SignOut', () => {
  it('forgets the session', async () => {
    const fakes = createFakes();

    expect(await new SignOut(fakes).execute()).toEqual(ok(undefined));
    expect(fakes.auth.session).toBeUndefined();
  });

  it('empties the meeting cache and the document cache, so that nothing the user saw stays on the device', async () => {
    const fakes = createFakes();
    await fillCaches(fakes);

    await new SignOut(fakes).execute();

    expect(fakes.meetingCache.isEmpty()).toBe(true);
    expect(fakes.documentCache.isEmpty()).toBe(true);
    expect(await fakes.meetingCache.readMeeting(aUserId(), aMeetingId())).toEqual(ok(undefined));
  });

  it('does not touch the vote outbox: the votes of the user wait for them to come back', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(aPendingVote());

    await new SignOut(fakes).execute();

    expect(fakes.outbox.snapshot()).toEqual([aPendingVote()]);
  });

  it('succeeds when nobody was signed in', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;

    expect(await new SignOut(fakes).execute()).toEqual(ok(undefined));
  });

  it('still signs out, and captures the failure, when a cache cannot be emptied', async () => {
    const fakes = createFakes();
    await fillCaches(fakes);
    fakes.meetingCache.purgeFailure = storageWriteFailed();
    fakes.documentCache.purgeFailure = storageWriteFailed();

    expect(await new SignOut(fakes).execute()).toEqual(ok(undefined));
    expect(fakes.auth.session).toBeUndefined();
    expect(fakes.monitoring.capturedEvents()).toEqual([
      MONITORING_EVENT.CachePurgeFailed,
      MONITORING_EVENT.CachePurgeFailed,
    ]);
  });

  it('returns the storage error when the session cannot be removed, and the caches are empty anyway', async () => {
    const fakes = createFakes();
    await fillCaches(fakes);
    fakes.auth.signOutFailure = storageWriteFailed();

    expect(await new SignOut(fakes).execute()).toEqual(err(storageWriteFailed()));
    expect(fakes.auth.session).toEqual(aSession());
    expect(fakes.meetingCache.isEmpty()).toBe(true);
  });
});
