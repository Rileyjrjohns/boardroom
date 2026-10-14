import { appLocked, notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { storageWriteFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { NOW, aPendingVote, aSession, aUserId, aVote } from '@domain/testing/builders';

import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '../../ports/Monitoring';
import { createFakes } from '../../testing/createFakes';

import { DiscardUnreadableVotes } from './DiscardUnreadableVotes';

const OWN = aUserId();
const OTHER = aUserId('user-2');

describe('DiscardUnreadableVotes', () => {
  it('deletes the entries of the signed-in user that cannot be read, and says how many', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    fakes.outbox.seedUnreadable(OWN, 'k2');

    const result = await new DiscardUnreadableVotes(fakes).execute();

    expect(result).toEqual(ok(2));
    expect(fakes.outbox.unreadableSnapshot()).toEqual([]);
  });

  it('leaves the votes that can be read, and the entries of another user', async () => {
    const fakes = createFakes();
    const queued = aPendingVote(aVote());
    fakes.outbox.seed(queued);
    fakes.outbox.seedUnreadable(OWN, 'k1');
    fakes.outbox.seedUnreadable(OTHER, 'k2');

    await new DiscardUnreadableVotes(fakes).execute();

    expect(fakes.outbox.snapshot()).toEqual([queued]);
    expect(fakes.outbox.unreadableSnapshot()).toEqual([{ voterId: OTHER, key: 'k2' }]);
  });

  it('says zero when there is nothing to discard, and when asked again', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    const useCase = new DiscardUnreadableVotes(fakes);

    expect(await useCase.execute()).toEqual(ok(1));
    expect(await useCase.execute()).toEqual(ok(0));
  });

  it('records that the user asked for it, with the count and nothing that identifies a vote', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');

    await new DiscardUnreadableVotes(fakes).execute();

    expect(fakes.monitoring.logs).toEqual([
      {
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.UnreadableVotesDiscarded,
        attributes: { [LOG_ATTRIBUTE.Discarded]: 1 },
      },
    ]);
  });

  it('returns the storage error when the entries cannot be deleted, and they stay', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    fakes.outbox.discardFailure = storageWriteFailed();

    expect(await new DiscardUnreadableVotes(fakes).execute()).toEqual(err(storageWriteFailed()));
    expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
    expect(fakes.monitoring.logs).toEqual([]);
  });

  it('requires a valid session, and discards nothing without one', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    const useCase = new DiscardUnreadableVotes(fakes);

    fakes.auth.session = undefined;
    expect(await useCase.execute()).toEqual(err(notAuthenticated()));
    fakes.auth.session = aSession({ expiresAt: NOW });
    expect(await useCase.execute()).toEqual(err(sessionExpired()));
    fakes.auth.session = aSession();
    fakes.appLock.lock();
    expect(await useCase.execute()).toEqual(err(appLocked()));

    expect(fakes.outbox.unreadableSnapshot()).toHaveLength(1);
  });
});
