import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@domain/errors/AuthenticationError';
import { storageReadFailed, storageWriteFailed } from '@domain/errors/StorageError';
import { voteNotRejected } from '@domain/errors/VoteDeliveryError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUser,
  aUserId,
  aVote,
} from '@domain/testing/builders';

import { createFakes } from '../../testing/createFakes';

import { AcknowledgeRejectedVote } from './AcknowledgeRejectedVote';

const INPUT = { resolutionId: aResolutionId() };
const REJECTED = aRejectedVote();

describe('AcknowledgeRejectedVote', () => {
  it('deletes the rejected vote of the user on the resolution', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);

    expect(await new AcknowledgeRejectedVote(fakes).execute(INPUT)).toEqual(ok(undefined));
    expect(fakes.outbox.snapshot()).toEqual([]);
  });

  it('leaves the other votes alone', async () => {
    const fakes = createFakes();
    const other = aRejectedVote(aVote({ resolutionId: aResolutionId('r2') }));
    const pending = aPendingVote(aVote({ resolutionId: aResolutionId('r3') }));
    fakes.outbox.seed(other, REJECTED, pending);

    await new AcknowledgeRejectedVote(fakes).execute(INPUT);

    expect(fakes.outbox.snapshot()).toEqual([other, pending]);
  });

  it('does not delete a vote that is still pending: it leaves the outbox by being sent', async () => {
    const fakes = createFakes();
    const pending = aPendingVote();
    fakes.outbox.seed(pending);

    expect(await new AcknowledgeRejectedVote(fakes).execute(INPUT)).toEqual(err(voteNotRejected()));
    expect(fakes.outbox.snapshot()).toEqual([pending]);
  });

  it('is harmless when there is nothing to acknowledge, as on a double tap', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);
    const useCase = new AcknowledgeRejectedVote(fakes);

    await useCase.execute(INPUT);

    expect(await useCase.execute(INPUT)).toEqual(ok(undefined));
  });

  it('cannot delete the rejected vote of another user', async () => {
    const fakes = createFakes();
    const others = aRejectedVote(aVote({ voterId: aUserId('user-2') }));
    fakes.outbox.seed(others);

    expect(await new AcknowledgeRejectedVote(fakes).execute(INPUT)).toEqual(ok(undefined));
    expect(fakes.outbox.snapshot()).toEqual([others]);
  });

  it('requires a valid session', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);
    const useCase = new AcknowledgeRejectedVote(fakes);

    fakes.auth.session = undefined;
    expect(await useCase.execute(INPUT)).toEqual(err(notAuthenticated()));

    fakes.auth.session = aSession({ expiresAt: NOW });
    expect(await useCase.execute(INPUT)).toEqual(err(sessionExpired()));
    expect(fakes.outbox.snapshot()).toEqual([REJECTED]);
  });

  it('deletes nothing once somebody else is signed in', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);
    fakes.outbox.onRequest = () => {
      fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-2') }) });
    };

    expect(await new AcknowledgeRejectedVote(fakes).execute(INPUT)).toEqual(err(sessionChanged()));
    expect(fakes.outbox.snapshot()).toEqual([REJECTED]);
  });

  it('deletes nothing once the app is locked', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);
    fakes.outbox.onRequest = () => fakes.appLock.lock();

    expect(await new AcknowledgeRejectedVote(fakes).execute(INPUT)).toEqual(err(appLocked()));
    expect(fakes.outbox.snapshot()).toEqual([REJECTED]);
  });

  it('returns the storage errors of the outbox', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(REJECTED);
    const useCase = new AcknowledgeRejectedVote(fakes);

    fakes.outbox.findFailure = storageReadFailed();
    expect(await useCase.execute(INPUT)).toEqual(err(storageReadFailed()));

    fakes.outbox.findFailure = undefined;
    fakes.outbox.removeFailure = storageWriteFailed();
    expect(await useCase.execute(INPUT)).toEqual(err(storageWriteFailed()));
    expect(fakes.outbox.snapshot()).toEqual([REJECTED]);
  });
});
