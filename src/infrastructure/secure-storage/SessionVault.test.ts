import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { aSession, aUser, aUserId, anEmail, at } from '@domain/testing/builders';

import { MemorySecureStorage } from '../testing/MemorySecureStorage';

import { SECURE_STORAGE_KEY } from './SecureStorage';
import { SessionVault } from './SessionVault';

const SIGNED_IN = { token: 'token-of-alice', session: aSession() };
/** What the vault gives the client for it: the token, with the user it belongs to. */
const ALICE_TOKEN = { token: 'token-of-alice', userId: aUserId('user-1') };
const BRUNO = {
  token: 'token-of-bruno',
  session: aSession({
    user: aUser({
      id: aUserId('user-2'),
      fullName: 'Bruno Durand',
      email: anEmail('bruno@example.com'),
    }),
    expiresAt: at(7_200_000),
  }),
};

function aVault(timeoutMillis = 1000) {
  const storage = new MemorySecureStorage();
  const monitoring = new FakeMonitoring();
  const vault = new SessionVault({ storage, monitoring, timeoutMillis });
  return {
    storage,
    monitoring,
    vault,
    again: () => new SessionVault({ storage, monitoring, timeoutMillis }),
  };
}

describe('SessionVault', () => {
  it('holds nobody at first, which is not an error', async () => {
    const { vault } = aVault();

    expect(await vault.session()).toStrictEqual(ok(undefined));
    expect(await vault.token()).toStrictEqual(ok(undefined));
  });

  it('keeps the session and the token it is given, and gives the session as it was', async () => {
    const { vault } = aVault();

    expect(await vault.replace(SIGNED_IN)).toStrictEqual(ok(undefined));

    expect(await vault.session()).toStrictEqual(ok(SIGNED_IN.session));
    expect(await vault.token()).toStrictEqual(ok(ALICE_TOKEN));
  });

  it('writes one item, so that a session and a token can never be those of two users', async () => {
    const { vault, storage } = aVault();

    await vault.replace(SIGNED_IN);
    await vault.replace(BRUNO);

    const items = storage.snapshot();
    expect(Object.keys(items)).toEqual([SECURE_STORAGE_KEY.Session]);
    expect(JSON.parse(items[SECURE_STORAGE_KEY.Session] ?? '')).toEqual({
      token: 'token-of-bruno',
      user: { id: 'user-2', fullName: 'Bruno Durand', email: 'bruno@example.com' },
      expiresAt: at(7_200_000),
    });
  });

  it('finds the session again when the app starts again, reading the storage once', async () => {
    const { vault, again, storage } = aVault();
    await vault.replace(SIGNED_IN);
    const reads = jest.spyOn(storage, 'get');
    const restarted = again();

    expect(await restarted.session()).toStrictEqual(ok(SIGNED_IN.session));
    expect(await restarted.token()).toStrictEqual(ok(ALICE_TOKEN));
    expect(await restarted.session()).toStrictEqual(ok(SIGNED_IN.session));

    expect(reads).toHaveBeenCalledTimes(1);
  });

  it('leaves the session as it was when the write fails, in memory and in the storage', async () => {
    const { vault, storage } = aVault();
    await vault.replace(SIGNED_IN);
    storage.failNext();

    const failed = await vault.replace(BRUNO);

    expect(failed).toStrictEqual(
      err({ code: STORAGE_ERROR_CODE.WriteFailed, cause: 'unknown failure' }),
    );
    expect(await vault.session()).toStrictEqual(ok(SIGNED_IN.session));
    expect(await vault.token()).toStrictEqual(ok(ALICE_TOKEN));
    expect(JSON.parse(storage.snapshot()[SECURE_STORAGE_KEY.Session] ?? '').token).toBe(
      'token-of-alice',
    );
  });

  it('forgets the session and the token, in memory and in the storage', async () => {
    const { vault, storage, again } = aVault();
    await vault.replace(SIGNED_IN);

    expect(await vault.clear()).toStrictEqual(ok(undefined));

    expect(await vault.session()).toStrictEqual(ok(undefined));
    expect(await vault.token()).toStrictEqual(ok(undefined));
    expect(storage.snapshot()).toEqual({});
    expect(await again().session()).toStrictEqual(ok(undefined));
  });

  it('succeeds in clearing when there was nothing to clear', async () => {
    const { vault } = aVault();

    expect(await vault.clear()).toStrictEqual(ok(undefined));
    expect(await vault.clear()).toStrictEqual(ok(undefined));
  });

  it('stops using the token at once, and says so, when the storage cannot forget it, and can try again', async () => {
    const { vault, storage } = aVault();
    await vault.replace(SIGNED_IN);
    storage.failNext();

    const failed = await vault.clear();

    expect(failed).toMatchObject({ ok: false, error: { code: STORAGE_ERROR_CODE.WriteFailed } });
    expect(await vault.token()).toStrictEqual(ok(undefined));
    expect(await vault.clear()).toStrictEqual(ok(undefined));
    expect(storage.snapshot()).toEqual({});
  });

  it('reports a storage that cannot be read, tries again at the next call, and does not remember the failure', async () => {
    const { vault, storage, again } = aVault();
    await vault.replace(SIGNED_IN);
    const restarted = again();
    storage.failNext();

    const failed = await restarted.session();

    expect(failed).toMatchObject({ ok: false, error: { code: STORAGE_ERROR_CODE.ReadFailed } });
    expect(await restarted.token()).toMatchObject({ ok: true, value: ALICE_TOKEN });
  });

  it('turns a storage that does not answer into a failure within the time it was given', async () => {
    const { vault, storage } = aVault(20);
    storage.hang();

    expect(await vault.session()).toStrictEqual(
      err({ code: STORAGE_ERROR_CODE.ReadFailed, cause: 'timeout' }),
    );
    expect(await vault.replace(SIGNED_IN)).toStrictEqual(
      err({ code: STORAGE_ERROR_CODE.WriteFailed, cause: 'timeout' }),
    );
    expect(await vault.clear()).toStrictEqual(
      err({ code: STORAGE_ERROR_CODE.WriteFailed, cause: 'timeout' }),
    );
  });

  it('runs the operations in the order they were asked, so that the last sign-in is the session', async () => {
    const { vault, storage } = aVault();

    await Promise.all([
      vault.replace(SIGNED_IN),
      vault.replace(BRUNO),
      vault.clear(),
      vault.replace(SIGNED_IN),
    ]);

    expect(await vault.token()).toStrictEqual(ok(ALICE_TOKEN));
    expect(JSON.parse(storage.snapshot()[SECURE_STORAGE_KEY.Session] ?? '').token).toBe(
      'token-of-alice',
    );
  });

  it('keeps going after an operation failed', async () => {
    const { vault, storage } = aVault();
    storage.failNext();

    const [failed, succeeded] = await Promise.all([vault.replace(SIGNED_IN), vault.replace(BRUNO)]);

    expect(failed.ok).toBe(false);
    expect(succeeded.ok).toBe(true);
    expect(await vault.token()).toStrictEqual(
      ok({ token: 'token-of-bruno', userId: aUserId('user-2') }),
    );
  });

  describe('an item that no longer reads back', () => {
    const VALID = JSON.stringify({
      token: 't',
      user: { id: 'user-1', fullName: 'Alice Martin', email: 'alice@example.com' },
      expiresAt: 1000,
    });

    it.each([
      ['text that is not JSON', 'not json'],
      ['JSON of another shape', '{"token":"t"}'],
      ['an empty token', VALID.replace('"t"', '""')],
      ['a user whose email is not one', VALID.replace('alice@example.com', 'nobody')],
      ['a blank user id', VALID.replace('user-1', ' ')],
      ['an expiry that is not an instant', VALID.replace('1000', '-5')],
      ['an expiry that is text', VALID.replace('1000', '"soon"')],
    ])(
      'is treated as nobody signed in for %s: reported, without its content, and deleted',
      async (_name, raw) => {
        const { vault, storage, monitoring } = aVault();
        storage.seed(SECURE_STORAGE_KEY.Session, raw);

        expect(await vault.session()).toStrictEqual(ok(undefined));
        expect(await vault.token()).toStrictEqual(ok(undefined));

        expect(storage.snapshot()).toEqual({});
        expect(monitoring.errors.map(({ event, attributes }) => [event, attributes])).toEqual([
          [MONITORING_EVENT.StoredRowDiscarded, { [LOG_ATTRIBUTE.Resource]: 'session' }],
        ]);
        expect(JSON.stringify(monitoring.errors)).not.toContain('alice@example.com');
      },
    );

    it('still answers nobody when the bad item cannot be deleted either', async () => {
      const { vault, storage } = aVault();
      storage.seed(SECURE_STORAGE_KEY.Session, 'not json');
      jest.spyOn(storage, 'remove').mockRejectedValue(new Error('locked'));

      expect(await vault.session()).toStrictEqual(ok(undefined));
    });

    it('reads a valid item', async () => {
      const { vault, storage } = aVault();
      storage.seed(SECURE_STORAGE_KEY.Session, VALID);

      expect(await vault.token()).toStrictEqual(ok({ token: 't', userId: aUserId('user-1') }));
    });
  });
});

describe('SessionVault, an operation that landed late', () => {
  /** Lets what is waiting on the storage and on the timers run. */
  const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  it('does not bring a signed-out session back: a sign-in whose write times out, a sign-out, then the write lands', async () => {
    const { vault, storage } = aVault(20);
    await vault.replace(SIGNED_IN);
    const land = storage.holdNext();

    const timedOut = await vault.replace(BRUNO);
    const signedOut = await vault.clear();
    land();
    await settle();

    expect(timedOut).toMatchObject({ ok: false, error: { code: STORAGE_ERROR_CODE.WriteFailed } });
    expect(signedOut).toStrictEqual(ok(undefined));
    expect(storage.snapshot()).toEqual({});
    expect(await vault.session()).toStrictEqual(ok(undefined));
  });

  it('does not bring a signed-out session back from a storage that never held one', async () => {
    const { vault, storage, again } = aVault(20);
    await vault.clear();
    const land = storage.holdNext();

    await vault.replace(SIGNED_IN);
    await vault.clear();
    land();
    await settle();

    expect(storage.snapshot()).toEqual({});
    expect(await again().session()).toStrictEqual(ok(undefined));
  });

  it('does not drop a session that was signed in after a sign-out whose removal timed out', async () => {
    const { vault, storage } = aVault(20);
    await vault.replace(SIGNED_IN);
    const land = storage.holdNext();

    const timedOut = await vault.clear();
    await vault.replace(BRUNO);
    land();
    await settle();

    expect(timedOut).toMatchObject({ ok: false });
    expect(JSON.parse(storage.snapshot()[SECURE_STORAGE_KEY.Session] ?? '{}').token).toBe(
      'token-of-bruno',
    );
    expect(await vault.token()).toStrictEqual(
      ok({ token: 'token-of-bruno', userId: aUserId('user-2') }),
    );
  });

  it('puts back the session the vault still holds when a write that failed lands anyway', async () => {
    const { vault, storage } = aVault(20);
    await vault.replace(SIGNED_IN);
    const land = storage.holdNext();

    await vault.replace(BRUNO);
    land();
    await settle();

    expect(JSON.parse(storage.snapshot()[SECURE_STORAGE_KEY.Session] ?? '{}').token).toBe(
      'token-of-alice',
    );
    expect(await vault.token()).toStrictEqual(ok(ALICE_TOKEN));
  });

  it('keeps the session it holds when the correction of a late write fails too', async () => {
    const { vault, storage } = aVault(20);
    await vault.replace(SIGNED_IN);
    const land = storage.holdNext();
    await vault.replace(BRUNO);
    storage.failNext();

    land();
    await settle();

    expect(await vault.session()).toStrictEqual(ok(SIGNED_IN.session));
  });

  it('does not wait for a storage that holds a call for ever: the next operation still settles', async () => {
    const { vault, storage } = aVault(20);
    storage.holdNext();

    await vault.replace(SIGNED_IN);
    const cleared = await vault.clear();

    expect(cleared).toStrictEqual(ok(undefined));
  });

  it('runs operations in the order they were asked for, even if the storage answers the first one last', async () => {
    const { vault, storage } = aVault(5000);
    await vault.replace(SIGNED_IN);
    const release = storage.holdNext();
    const calls = jest.spyOn(storage, 'set');

    const first = vault.replace(BRUNO);
    const second = vault.clear();
    await settle();
    // The second operation has not touched the storage: it waits for the first.
    expect(calls).toHaveBeenCalledTimes(1);
    release();

    expect((await Promise.all([first, second])).map((answer) => answer.ok)).toEqual([true, true]);
    expect(storage.snapshot()).toEqual({});
  });
});
