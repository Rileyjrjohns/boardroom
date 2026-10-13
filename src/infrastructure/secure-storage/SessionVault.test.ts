import { STORAGE_ERROR_CODE } from '@domain/errors/StorageError';
import { err, ok } from '@domain/shared/Result';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';
import { aSession, aUser, aUserId, anEmail, at } from '@domain/testing/builders';

import { MemorySecureStorage } from '../testing/MemorySecureStorage';

import { SECURE_STORAGE_KEY } from './SecureStorage';
import { SessionVault } from './SessionVault';

const SIGNED_IN = { token: 'token-of-alice', session: aSession() };
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
    expect(await vault.token()).toStrictEqual(ok('token-of-alice'));
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
    expect(await restarted.token()).toStrictEqual(ok('token-of-alice'));
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
    expect(await vault.token()).toStrictEqual(ok('token-of-alice'));
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
    expect(await restarted.token()).toMatchObject({ ok: true, value: 'token-of-alice' });
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

    expect(await vault.token()).toStrictEqual(ok('token-of-alice'));
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
    expect(await vault.token()).toStrictEqual(ok('token-of-bruno'));
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

      expect(await vault.token()).toStrictEqual(ok('t'));
    });
  });
});
