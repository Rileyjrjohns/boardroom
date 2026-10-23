import { valueOf } from '@core/application/testing/contracts/support';
import { invalidCredentials } from '@core/domain/errors/AuthenticationError';
import { networkUnavailable } from '@core/domain/errors/RepositoryError';
import { err, ok } from '@core/domain/shared/Result';
import type { Instant } from '@core/domain/value-objects/Instant';
import type { User } from '@features/auth/domain/entities/User';
import { isSessionExpired } from '@features/auth/domain/policies/sessionExpiry';
import type { Credentials } from '@features/auth/domain/value-objects/Credentials';
import { anEmail } from '@testing/domain/builders';

import type { AuthSession } from '../../ports/AuthSession';

export interface AuthSessionAccount {
  readonly credentials: Credentials;
  /** The user the adapter opens a session for when these credentials are accepted. */
  readonly user: User;
}

export interface AuthSessionHarness {
  readonly auth: AuthSession;
  /** Two accounts the adapter accepts, of two different users. Nobody is signed in at first. */
  readonly accounts: readonly [AuthSessionAccount, AuthSessionAccount];
  /** The instant the adapter reads from its clock. */
  now(): Instant;
  advanceClock(millis: number): void;
  /** Cuts and restores the connection a sign-in needs. */
  setOnline(online: boolean): void;
}

export type AuthSessionFactory = () => AuthSessionHarness | Promise<AuthSessionHarness>;

const UNKNOWN_EMAIL = anEmail('nobody@example.com');

/**
 * The contract of `AuthSession`, as a suite any implementation runs: credentials are checked,
 * the session is remembered and returned as stored (expired or not), signing out forgets it and
 * always succeeds, and a session ends at an instant computed on the clock of the adapter.
 */
export function describeAuthSessionContract(name: string, createHarness: AuthSessionFactory): void {
  describe(`${name} honours the AuthSession contract`, () => {
    let harness: AuthSessionHarness;
    let auth: AuthSession;
    let alice: AuthSessionAccount;
    let bruno: AuthSessionAccount;

    beforeEach(async () => {
      harness = await createHarness();
      auth = harness.auth;
      [alice, bruno] = harness.accounts;
    });

    it('has nobody signed in at first, which is a success and not an error', async () => {
      expect(await auth.current()).toStrictEqual(ok(undefined));
    });

    it('signs in an account and returns the session of its user, which ends in the future', async () => {
      const session = valueOf(await auth.signIn(alice.credentials));

      expect(session.user).toStrictEqual(alice.user);
      expect(session.expiresAt).toBeGreaterThan(harness.now());
      expect(isSessionExpired(session, harness.now())).toBe(false);
    });

    it('remembers the session it opened', async () => {
      const session = valueOf(await auth.signIn(alice.credentials));

      expect(await auth.current()).toStrictEqual(ok(session));
    });

    it('returns the session as stored even when its expiry has passed: deciding that is not its job', async () => {
      const session = valueOf(await auth.signIn(alice.credentials));

      harness.advanceClock(session.expiresAt - harness.now() + 1);

      expect(isSessionExpired(session, harness.now())).toBe(true);
      expect(await auth.current()).toStrictEqual(ok(session));
    });

    it.each([
      ['a wrong password', (c: Credentials) => ({ ...c, password: `${c.password}x` })],
      [
        'a password in another case',
        (c: Credentials) => ({ ...c, password: c.password.toUpperCase() }),
      ],
      [
        'a password that was trimmed',
        (c: Credentials) => ({ ...c, password: c.password.trim() + ' ' }),
      ],
      ['an email nobody registered', (c: Credentials) => ({ ...c, email: UNKNOWN_EMAIL })],
    ])('refuses %s with invalidCredentials, and signs nobody in', async (_name, tamper) => {
      expect(await auth.signIn(tamper(alice.credentials))).toStrictEqual(err(invalidCredentials()));

      expect(await auth.current()).toStrictEqual(ok(undefined));
    });

    it('keeps the current session when a later sign-in is refused', async () => {
      const session = valueOf(await auth.signIn(alice.credentials));

      await auth.signIn({ ...bruno.credentials, password: `${bruno.credentials.password}x` });

      expect(await auth.current()).toStrictEqual(ok(session));
    });

    it('replaces the session when another user signs in', async () => {
      await auth.signIn(alice.credentials);
      const second = valueOf(await auth.signIn(bruno.credentials));

      expect(second.user).toStrictEqual(bruno.user);
      expect(await auth.current()).toStrictEqual(ok(second));
    });

    it('forgets the session on sign-out, and succeeds when nobody was signed in', async () => {
      await auth.signIn(alice.credentials);

      expect(await auth.signOut()).toStrictEqual(ok(undefined));
      expect(await auth.current()).toStrictEqual(ok(undefined));
      expect(await auth.signOut()).toStrictEqual(ok(undefined));
    });

    it('answers networkUnavailable to a sign-in without a connection, signs nobody in, and recovers', async () => {
      harness.setOnline(false);

      expect(await auth.signIn(alice.credentials)).toStrictEqual(err(networkUnavailable()));
      expect(await auth.current()).toStrictEqual(ok(undefined));

      harness.setOnline(true);
      expect((await auth.signIn(alice.credentials)).ok).toBe(true);
    });
  });
}
