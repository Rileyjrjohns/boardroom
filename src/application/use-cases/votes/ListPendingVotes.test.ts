import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { storageReadFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import {
  NOW,
  aPendingVote,
  aRejectedVote,
  aResolutionId,
  aSession,
  aUserId,
  aVote,
  at,
} from '@domain/testing/builders';

import { createFakes } from '../../testing/createFakes';

import { ListPendingVotes } from './ListPendingVotes';

const FIRST = aPendingVote(aVote({ resolutionId: aResolutionId('r1') }), at(-2000));
const SECOND = aPendingVote(aVote({ resolutionId: aResolutionId('r2') }), at(-1000));
const REJECTED = aRejectedVote(aVote({ resolutionId: aResolutionId('r4') }));
const OTHERS = aPendingVote(
  aVote({ voterId: aUserId('user-2'), resolutionId: aResolutionId('r3') }),
);
const OTHERS_REJECTED = aRejectedVote(
  aVote({ voterId: aUserId('user-2'), resolutionId: aResolutionId('r5') }),
);

describe('ListPendingVotes', () => {
  it('lists the votes of the signed-in user, oldest first', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(FIRST, SECOND);

    expect(await new ListPendingVotes(fakes).execute()).toEqual(
      ok({ pending: [FIRST, SECOND], rejected: [], unreadable: 0 }),
    );
  });

  it('tells the rejected votes from the pending ones', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(FIRST, REJECTED, SECOND);

    expect(await new ListPendingVotes(fakes).execute()).toEqual(
      ok({ pending: [FIRST, SECOND], rejected: [REJECTED], unreadable: 0 }),
    );
  });

  it('never reads the votes of another user, pending or rejected', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(FIRST, OTHERS, OTHERS_REJECTED, SECOND);

    expect(await new ListPendingVotes(fakes).execute()).toEqual(
      ok({ pending: [FIRST, SECOND], rejected: [], unreadable: 0 }),
    );
  });

  it('lists nothing when the outbox is empty', async () => {
    expect(await new ListPendingVotes(createFakes()).execute()).toEqual(
      ok({ pending: [], rejected: [], unreadable: 0 }),
    );
  });

  it('says how many entries of the user cannot be read as a vote, and lists the others', async () => {
    const fakes = createFakes();
    fakes.outbox.seed(FIRST);
    fakes.outbox.seedUnreadable(aUserId(), 'k1');
    fakes.outbox.seedUnreadable(aUserId(), 'k2');
    fakes.outbox.seedUnreadable(aUserId('user-2'), 'k3');

    expect(await new ListPendingVotes(fakes).execute()).toEqual(
      ok({ pending: [FIRST], rejected: [], unreadable: 2 }),
    );
  });

  it('does not delete what it cannot read: asking again says the same', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(aUserId(), 'k1');
    const useCase = new ListPendingVotes(fakes);

    await useCase.execute();
    const again = await useCase.execute();

    expect(again.ok && again.value.unreadable).toBe(1);
    expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
  });

  it('requires a valid session', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    expect(await new ListPendingVotes(fakes).execute()).toEqual(err(notAuthenticated()));

    fakes.auth.session = aSession({ expiresAt: NOW });
    expect(await new ListPendingVotes(fakes).execute()).toEqual(err(sessionExpired()));
  });

  it('returns the storage error when the outbox cannot be read', async () => {
    const fakes = createFakes();
    fakes.outbox.listFailure = storageReadFailed();

    expect(await new ListPendingVotes(fakes).execute()).toEqual(err(storageReadFailed()));
  });
});
