import { NOW, aSession, at } from '@testing/domain/builders';

import { isSessionExpired } from './sessionExpiry';

describe('isSessionExpired', () => {
  const session = aSession({ expiresAt: NOW });

  it('is false before the expiry', () => {
    expect(isSessionExpired(session, at(-1))).toBe(false);
  });

  it('is true at the expiry instant', () => {
    expect(isSessionExpired(session, NOW)).toBe(true);
  });

  it('is true after the expiry', () => {
    expect(isSessionExpired(session, at(1))).toBe(true);
  });
});
