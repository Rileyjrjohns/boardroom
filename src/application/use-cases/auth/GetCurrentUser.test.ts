import { appLocked, notAuthenticated, sessionExpired } from '@domain/errors/AuthenticationError';
import { storageReadFailed } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { NOW, aSession, aUser, aUserId, anEmail } from '@domain/testing/builders';

import { createFakes } from '../../testing/createFakes';

import { GetCurrentUser } from './GetCurrentUser';

describe('GetCurrentUser', () => {
  it('answers with the signed-in user', async () => {
    const fakes = createFakes();
    const user = aUser({
      id: aUserId('user-9'),
      fullName: 'Nadia Benali',
      email: anEmail('n@x.fr'),
    });
    fakes.auth.session = aSession({ user });

    expect(await new GetCurrentUser(fakes).execute()).toEqual(ok(user));
  });

  it('requires a valid session', async () => {
    const fakes = createFakes();
    fakes.auth.session = undefined;
    expect(await new GetCurrentUser(fakes).execute()).toEqual(err(notAuthenticated()));

    fakes.auth.session = aSession({ expiresAt: NOW });
    expect(await new GetCurrentUser(fakes).execute()).toEqual(err(sessionExpired()));
  });

  it('discloses nobody while the app is locked', async () => {
    const fakes = createFakes();
    fakes.appLock.lock();

    expect(await new GetCurrentUser(fakes).execute()).toEqual(err(appLocked()));
  });

  it('returns the storage error when the session cannot be read', async () => {
    const fakes = createFakes();
    fakes.auth.readFailure = storageReadFailed();

    expect(await new GetCurrentUser(fakes).execute()).toEqual(err(storageReadFailed()));
  });
});
