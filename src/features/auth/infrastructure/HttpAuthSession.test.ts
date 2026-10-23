import { MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { invalidCredentials } from '@features/auth/domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { STORAGE_ERROR_CODE } from '@core/domain/errors/StorageError';
import { err, ok } from '@core/domain/shared/Result';
import { SECURE_STORAGE_KEY } from '@core/infrastructure/secure-storage/SecureStorage';
import { MemorySecureStorage } from '@core/infrastructure/testing/MemorySecureStorage';
import { aMeeting, aMeetingId, aParticipant, MILLIS_PER_HOUR } from '@testing/domain/builders';
import { createHttpWorld, installMockApi } from '@testing/infrastructure/httpWorld';
import { TEST_PASSWORD } from '@testing/infrastructure/testServer';

import { SessionVault } from './SessionVault';

import { HttpAuthSession } from './HttpAuthSession';

// What the contract suite cannot say about the HTTP side of the session: what is kept on the
// device, where, and what a refusal of the server becomes. The contract suite runs in
// HttpRepositories.test.ts.

const installed = installMockApi();

async function aWorld() {
  const world = await createHttpWorld(installed);
  const [alice, bruno] = world.accounts;
  if (alice === undefined || bruno === undefined)
    throw new Error('The test server has no account.');
  const credentials = (account: typeof alice) => ({
    email: account.user.email,
    password: account.password,
  });
  return { world, alice: credentials(alice), bruno: credentials(bruno), aliceUser: alice.user };
}

describe('HttpAuthSession', () => {
  it('keeps the session and the token in the secure storage, in one item', async () => {
    const { world, alice } = await aWorld();

    const session = await world.auth.signIn(alice);

    const item = JSON.parse(world.storage.snapshot()[SECURE_STORAGE_KEY.Session] ?? '{}') as Record<
      string,
      unknown
    >;
    expect(Object.keys(world.storage.snapshot())).toEqual([SECURE_STORAGE_KEY.Session]);
    expect(item.token).toEqual(expect.any(String));
    expect(item.user).toEqual({
      id: 'user-1',
      fullName: 'Alice Martin',
      email: 'alice@example.com',
    });
    expect(session.ok && session.value.expiresAt).toBe(item.expiresAt);
  });

  it('never gives the application the token: the session it returns holds a user and an expiry only', async () => {
    const { world, alice } = await aWorld();

    const session = await world.auth.signIn(alice);

    expect(session.ok && Object.keys(session.value).sort()).toEqual(['expiresAt', 'user']);
    expect(JSON.stringify(session)).not.toContain('token');
  });

  it('computes the expiry on the clock of the device from the lifetime the server grants', async () => {
    const { world, alice } = await aWorld();
    world.clock.advance(5_000);

    const session = await world.auth.signIn(alice);

    expect(session.ok && session.value.expiresAt).toBe(world.clock.now() + MILLIS_PER_HOUR);
  });

  it('is found again by an app that starts again on the same storage', async () => {
    const { world, alice } = await aWorld();
    const session = await world.auth.signIn(alice);
    const restarted = new HttpAuthSession({
      client: world.client,
      vault: new SessionVault({ storage: world.storage, monitoring: world.monitoring }),
      clock: world.clock,
      monitoring: world.monitoring,
    });

    expect(await restarted.current()).toStrictEqual(session.ok ? ok(session.value) : undefined);
  });

  it('leaves the session as it was, and says the storage failed, when the new session cannot be kept', async () => {
    const { world, alice, bruno } = await aWorld();
    const first = await world.auth.signIn(alice);
    world.storage.failNext();

    const failed = await world.auth.signIn(bruno);

    expect(failed).toMatchObject({ ok: false, error: { code: STORAGE_ERROR_CODE.WriteFailed } });
    expect(await world.auth.current()).toStrictEqual(first);
  });

  it('refuses credentials the server refuses, with invalidCredentials, and keeps nothing', async () => {
    const { world, alice } = await aWorld();

    const refused = await world.auth.signIn({ ...alice, password: `${TEST_PASSWORD}x` });

    expect(refused).toStrictEqual(err(invalidCredentials()));
    expect(world.storage.snapshot()).toEqual({});
  });

  it('forgets the session on sign-out, from the storage too, without telling the server', async () => {
    const { world, alice } = await aWorld();
    await world.auth.signIn(alice);
    installed.received.length = 0;

    expect(await world.auth.signOut()).toStrictEqual(ok(undefined));

    expect(world.storage.snapshot()).toEqual({});
    expect(installed.received).toEqual([]);
  });

  it('signs out even when the storage cannot forget, and reports it', async () => {
    const { world, alice } = await aWorld();
    await world.auth.signIn(alice);
    world.storage.failNext();

    const failed = await world.auth.signOut();

    expect(failed).toMatchObject({ ok: false, error: { code: STORAGE_ERROR_CODE.WriteFailed } });
    expect(await world.auth.current()).toStrictEqual(ok(undefined));
  });

  it('reports a session that cannot be read from the storage', async () => {
    const storage = new MemorySecureStorage();
    const { world } = await (async () => ({
      world: await createHttpWorld(installed, { storage }),
    }))();
    storage.failNext();

    expect(await world.auth.current()).toMatchObject({
      ok: false,
      error: { code: STORAGE_ERROR_CODE.ReadFailed },
    });
  });

  describe('when the server does not answer as expected', () => {
    it('is networkUnavailable without a connection', async () => {
      const { world, alice } = await aWorld();
      installed.conditions.online = false;

      expect(await world.auth.signIn(alice)).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
      );
      expect(world.storage.snapshot()).toEqual({});
    });

    it('is networkUnavailable when the simulated server is unreachable (503)', async () => {
      const { world, alice } = await aWorld();
      world.network.setOnline(false);

      expect(await world.auth.signIn(alice)).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.NetworkUnavailable }),
      );
    });

    it('is unexpected, with the status, for a body of the wrong shape, and reports where', async () => {
      const { world, alice } = await aWorld();
      jest
        .spyOn(world.client, 'request')
        .mockResolvedValue(
          err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' }),
        );

      expect(await world.auth.signIn(alice)).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' }),
      );
    });

    it.each([
      [REPOSITORY_ERROR_CODE.Forbidden, 'status 403'],
      [REPOSITORY_ERROR_CODE.NotFound, 'status 404'],
    ])('is unexpected for a %s, with %s as its only cause', async (code, cause) => {
      const { world, alice } = await aWorld();
      jest.spyOn(world.client, 'request').mockResolvedValue(err({ code }));

      expect(await world.auth.signIn(alice)).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause }),
      );
    });

    it('is unexpected for a rejection, which sign-in has no use for', async () => {
      const { world, alice } = await aWorld();
      jest
        .spyOn(world.client, 'request')
        .mockResolvedValue(err({ code: 'requestRejected', error: {} }));

      expect(await world.auth.signIn(alice)).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'status 422' }),
      );
    });

    it('is unexpected, and reports the rule broken, when the user the server describes is not valid', async () => {
      const { world, alice } = await aWorld();
      jest.spyOn(world.client, 'request').mockResolvedValue(
        ok({
          accessToken: 't',
          tokenType: 'Bearer',
          expiresIn: 60,
          user: { id: 'user-1', fullName: 'Alice', email: 'nobody' },
        }),
      );

      const answer = await world.auth.signIn(alice);

      expect(answer).toStrictEqual(
        err({ code: REPOSITORY_ERROR_CODE.Unexpected, cause: 'invalid response' }),
      );
      expect(world.monitoring.capturedEvents()).toEqual([MONITORING_EVENT.ResponseInvalid]);
      expect(world.storage.snapshot()).toEqual({});
    });
  });

  it('answers every request with the identity read when it was created, even if somebody signs in meanwhile', async () => {
    const { world, alice, bruno } = await aWorld();
    // A meeting that only Alice is invited to: with the token of Bruno, the request is forbidden.
    world.load({
      meetings: [aMeeting({ participants: [aParticipant()] })],
      recordedVotes: [],
    });
    await world.auth.signIn(alice);
    installed.conditions.delayMillis = 40;

    const inFlight = world.meetings.get(aMeetingId());
    await new Promise((resolve) => setTimeout(resolve, 5));
    const signingIn = world.auth.signIn(bruno);
    const answer = await inFlight;
    await signingIn;
    installed.conditions.delayMillis = 0;

    expect(answer.ok).toBe(true);
    // From then on the token is Bruno's, and the same request is forbidden.
    expect(await world.meetings.get(aMeetingId())).toStrictEqual(
      err({ code: REPOSITORY_ERROR_CODE.Forbidden }),
    );
  });
});
