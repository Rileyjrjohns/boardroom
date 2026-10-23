import { invalidCredentials } from '@core/domain/errors/AuthenticationError';
import { err, ok } from '@core/domain/shared/Result';
import { parseInstant } from '@core/domain/value-objects/Instant';
import { describeAuthSessionContract } from '@features/auth/application/testing/contracts/authSessionContract';
import { isSessionExpired } from '@features/auth/domain/policies/sessionExpiry';
import { MILLIS_PER_HOUR, aUser, at, unwrap } from '@testing/domain/builders';
import { TEST_PASSWORD, createTestServer, credentialsOf } from '@testing/infrastructure/testServer';

/** The latest instant there is: any session opened then would end after it. */
const LAST_INSTANT = unwrap(parseInstant(8_640_000_000_000_000));

describeAuthSessionContract('InMemoryAuthSession', () => {
  const server = createTestServer({ signedIn: false });
  const [first, second] = server.accounts;
  return {
    auth: server.auth,
    accounts: [
      { credentials: credentialsOf(first), user: first.user },
      { credentials: credentialsOf(second), user: second.user },
    ],
    now: () => server.clock.now(),
    advanceClock: (millis) => server.clock.advance(millis),
    setOnline: (online) => server.network.setOnline(online),
  };
});

describe('InMemoryAuthSession', () => {
  it('ends a session one lifetime after the sign-in, on the clock it is given', async () => {
    const server = createTestServer({ signedIn: false });
    const [alice] = server.accounts;

    const session = await server.auth.signIn({ email: alice.user.email, password: TEST_PASSWORD });

    expect(session).toStrictEqual(ok({ user: alice.user, expiresAt: at(MILLIS_PER_HOUR) }));
  });

  it('counts the lifetime from the instant of each sign-in', async () => {
    const server = createTestServer({ signedIn: false });
    const [alice] = server.accounts;
    server.clock.advance(5000);

    await server.auth.signIn({ email: alice.user.email, password: TEST_PASSWORD });
    const current = await server.auth.current();

    expect(current.ok && current.value?.expiresAt).toBe(at(5000 + MILLIS_PER_HOUR));
  });

  it('expires the session it opened when its lifetime is over', async () => {
    const server = createTestServer({ signedIn: false });
    const [alice] = server.accounts;
    const opened = server.auth.openSessionFor(alice.user);
    server.clock.advance(MILLIS_PER_HOUR - 1);

    const session = opened.ok ? opened.value : undefined;
    expect(session !== undefined && isSessionExpired(session, server.clock.now())).toBe(false);
    server.clock.advance(1);
    expect(session !== undefined && isSessionExpired(session, server.clock.now())).toBe(true);
  });

  it('opens a session for a user without credentials, and signs that user in', async () => {
    const server = createTestServer({ signedIn: false });
    const [alice] = server.accounts;

    const opened = server.auth.openSessionFor(alice.user);

    expect(opened).toStrictEqual(ok({ user: alice.user, expiresAt: at(MILLIS_PER_HOUR) }));
    expect(await server.auth.current()).toStrictEqual(opened);
  });

  it('refuses to open a session that would end beyond the range of an instant', () => {
    const server = createTestServer({ signedIn: false });
    server.clock.set(LAST_INSTANT);

    expect(server.auth.openSessionFor(aUser()).ok).toBe(false);
  });

  it('answers unexpected, not a thrown error, when it cannot compute the expiry of a sign-in', async () => {
    const server = createTestServer({ signedIn: false });
    const [alice] = server.accounts;
    server.clock.set(LAST_INSTANT);

    const result = await server.auth.signIn({ email: alice.user.email, password: TEST_PASSWORD });

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe('unexpected');
  });

  it('compares the email in the form the domain normalised it to', async () => {
    const server = createTestServer({ signedIn: false });

    expect(
      await server.auth.signIn({ email: server.accounts[1].user.email, password: TEST_PASSWORD }),
    ).toStrictEqual(ok({ user: server.accounts[1].user, expiresAt: at(MILLIS_PER_HOUR) }));
    expect(
      await server.auth.signIn({ email: server.accounts[1].user.email, password: 'wrong' }),
    ).toStrictEqual(err(invalidCredentials()));
  });
});
