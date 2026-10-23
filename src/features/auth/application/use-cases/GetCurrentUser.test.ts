import {
  appLocked,
  notAuthenticated,
  sessionExpired,
} from '@features/auth/domain/errors/AuthenticationError';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { createFakes } from '@testing/application/createFakes';
import { NOW, aSession, aUser, aUserId, anEmail } from '@testing/domain/builders';

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
