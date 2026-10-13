import { notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { storageReadFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { NOW, aSession, at } from '@domain/testing/builders';

import { FakeAuthSession } from '../testing/FakeAuthSession';
import { FakeClock } from '../testing/FakeClock';

import { requireSession } from './requireSession';

describe('requireSession', () => {
  it('returns the session of the signed-in user', async () => {
    const deps = { auth: new FakeAuthSession(), clock: new FakeClock() };

    expect(await requireSession(deps)).toEqual(ok(aSession()));
  });

  it('fails with notAuthenticated when nobody is signed in', async () => {
    const auth = new FakeAuthSession();
    auth.session = undefined;

    expect(await requireSession({ auth, clock: new FakeClock() })).toEqual(err(notAuthenticated()));
  });

  it('fails with sessionExpired once the expiry is reached, the instant itself included', async () => {
    const auth = new FakeAuthSession();
    auth.session = aSession({ expiresAt: NOW });
    const deps = { auth, clock: new FakeClock(NOW) };

    expect(await requireSession(deps)).toEqual(err(sessionExpired()));
  });

  it('accepts a session until its last millisecond', async () => {
    const auth = new FakeAuthSession();
    auth.session = aSession({ expiresAt: at(1) });
    const deps = { auth, clock: new FakeClock(NOW) };

    expect(await requireSession(deps)).toEqual(ok(aSession({ expiresAt: at(1) })));
  });

  it('returns the storage error when the session cannot be read', async () => {
    const auth = new FakeAuthSession();
    auth.readFailure = storageReadFailed();

    expect(await requireSession({ auth, clock: new FakeClock() })).toEqual(
      err(storageReadFailed()),
    );
  });
});
