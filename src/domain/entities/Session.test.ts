import { MILLIS_PER_HOUR, at, aUser } from '../testing/builders';

import { createSession } from './Session';

describe('createSession', () => {
  it('holds the user and the expiry', () => {
    const user = aUser();

    expect(createSession({ user, expiresAt: at(MILLIS_PER_HOUR) })).toEqual({
      user,
      expiresAt: at(MILLIS_PER_HOUR),
    });
  });
});
