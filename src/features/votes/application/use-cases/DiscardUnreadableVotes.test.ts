import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import {
  appLocked,
  notAuthenticated,
  sessionChanged,
  sessionExpired,
} from '@features/auth/domain/errors/AuthenticationError';
import { storageWriteFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aPendingVote, aSession, aUser, aUserId, aVote } from '@testing/domain/builders';

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

  it('does not report the count to somebody else who signed in meanwhile', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    fakes.outbox.onRequest = () => {
      fakes.auth.session = aSession({ user: aUser({ id: OTHER }) });
    };

    expect(await new DiscardUnreadableVotes(fakes).execute()).toEqual(err(sessionChanged()));
    expect(fakes.monitoring.logs).toEqual([]);
  });

  it('does not report the count once the app is locked', async () => {
    const fakes = createFakes();
    fakes.outbox.seedUnreadable(OWN, 'k1');
    fakes.outbox.onRequest = () => fakes.appLock.lock();

    expect(await new DiscardUnreadableVotes(fakes).execute()).toEqual(err(appLocked()));
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
