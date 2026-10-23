import { MIGRATIONS } from '@composition/persistence/migrations';
import type { Migration } from '@composition/persistence/migrations';
import { TABLE } from '@composition/persistence/schema';
import { LOG_ATTRIBUTE, MONITORING_EVENT } from '@core/application/ports/Monitoring';
import { FakeMonitoring } from '@core/application/testing/FakeMonitoring';
import { storageReadFailed } from '@core/domain/errors/StorageError';
import { databaseDirectory } from '@testing/infrastructure/testDatabase';

import { MemorySecureStorage } from '../testing/MemorySecureStorage';
import { nodeRandomBytes } from '../testing/nodeRandomBytes';
import { NodeSqliteOpener, nodeFileSystem } from '../testing/NodeSqlite';
import { SimulatedCipherOpener } from '../testing/SimulatedCipherOpener';
import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';

import { databaseFileName, formatKeyState } from './databaseKey';
import { RESET_REASON } from './localDataReset';
import { DATABASE_FAILURE, openProtectedDatabase } from './protectedDatabase';
import type { ProtectedDatabaseOptions } from './protectedDatabase';
import type { SqlDatabase } from './SqlDatabase';
import { unlockDatabase } from './unlockDatabase';

const directory = databaseDirectory();
const files = nodeFileSystem();
/** What the keychain holds for the database: the generation of the file, and the key. */
const STATE_FORMAT = /^[0-9]+:[0-9a-f]{64}$/;
const OTHER_KEY = 'c'.repeat(64);

let counter = 0;

/** A device: a keychain, a file system and the logs, that survive the app being started again. */
function aDevice(overrides: Partial<ProtectedDatabaseOptions> = {}) {
  counter += 1;
  const storage = new MemorySecureStorage();
  const monitoring = new FakeMonitoring();
  const nodeFiles = new NodeSqliteOpener(directory, files);
  const opener = new SimulatedCipherOpener(nodeFiles);
  const name = `protected-${counter}.db`;
  const options = {
    opener,
    storage,
    randomBytes: nodeRandomBytes,
    monitoring,
    name,
    migrations: MIGRATIONS,
    ...overrides,
  };
  return {
    storage,
    monitoring,
    opener,
    /** The files, to see what is on the device. */
    files: nodeFiles,
    name,
    /** A start of the app. */
    start: (more: Partial<ProtectedDatabaseOptions> = {}) =>
      openProtectedDatabase({ ...options, ...more }),
  };
}

type Device = ReturnType<typeof aDevice>;

/** Counts the connections the device opens and the ones that are closed again. */
function watchConnections(device: Device) {
  const counts = { opened: 0, closed: 0 };
  const open = device.opener.open.bind(device.opener);
  jest.spyOn(device.opener, 'open').mockImplementation(async (file) => {
    const connection = await open(file);
    counts.opened += 1;
    const close = connection.close.bind(connection);
    connection.close = async () => {
      counts.closed += 1;
      await close();
    };
    return connection;
  });
  return counts;
}

async function started(device: Device): Promise<SqlDatabase> {
  const opened = await device.start();
  if (!opened.ok)
    throw new Error(`The database should have opened: ${JSON.stringify(opened.error)}`);
  return opened.value;
}

const keyOf = (device: ReturnType<typeof aDevice>) =>
  device.storage.snapshot()[SECURE_STORAGE_KEY.DatabaseKey];

const mark = async (database: SqlDatabase) => {
  await database.run(
    `INSERT INTO ${TABLE.MeetingDetails} (owner, meeting_id, cached_at, payload) VALUES ('o', 'm', 1, '{}')`,
  );
};

const rowsOf = async (database: SqlDatabase) =>
  (await database.all(`SELECT count(*) AS total FROM ${TABLE.MeetingDetails}`))[0]?.total;

describe('openProtectedDatabase', () => {
  describe('the first start', () => {
    it('makes a 256-bit key, keeps it in the secure storage, and creates the database with it', async () => {
      const device = aDevice();

      const database = await started(device);

      const key = keyOf(device);
      expect(key).toMatch(STATE_FORMAT);
      expect(device.opener.keysUsed).toEqual([key?.slice(-64)]);
      expect(await database.all('PRAGMA user_version')).toEqual([
        { user_version: MIGRATIONS.length },
      ]);
      expect(device.monitoring.logs).toEqual([]);
    });

    it('sets the connection up to overwrite what is deleted, so that a removed vote does not stay in the file', async () => {
      const device = aDevice();

      const database = await started(device);

      expect(await database.all('PRAGMA secure_delete')).toEqual([{ secure_delete: 1 }]);
    });

    it('makes a different key for each installation', async () => {
      const keys = new Set<string | undefined>();
      for (let installation = 0; installation < 5; installation += 1) {
        const device = aDevice();
        await started(device);
        keys.add(keyOf(device));
      }

      expect(keys.size).toBe(5);
    });

    it('stores the key before the database exists, so that a start stopped in between loses nothing', async () => {
      const device = aDevice();
      device.opener.failNextOpens();

      const stopped = await device.start();

      expect(stopped).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      const keptKey = keyOf(device);
      expect(keptKey).toMatch(STATE_FORMAT);
      expect(device.opener.has(device.name)).toBe(false);

      const database = await started(device);
      expect(await database.all('PRAGMA user_version')).toEqual([
        { user_version: MIGRATIONS.length },
      ]);
      expect(keyOf(device)).toBe(keptKey);
      expect(device.opener.keysUsed).toEqual([keptKey?.slice(-64)]);
    });
  });

  describe('the starts after', () => {
    it('opens the database with the key it kept, and finds what was in it', async () => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      const key = keyOf(device);

      const second = await started(device);

      expect(await rowsOf(second)).toBe(1);
      expect(keyOf(device)).toBe(key);
      expect(device.opener.keysUsed).toEqual([key?.slice(-64), key?.slice(-64)]);
      expect(device.monitoring.logs).toEqual([]);
    });

    it('migrates a database from an older version of the app', async () => {
      const device = aDevice();
      const first = await openProtectedDatabase({
        opener: device.opener,
        storage: device.storage,
        randomBytes: nodeRandomBytes,
        monitoring: device.monitoring,
        name: device.name,
        migrations: MIGRATIONS.slice(0, 1),
      });
      if (!first.ok) throw new Error('should have opened');
      await mark(first.value);
      await first.value.close();

      const second = await started(device);

      expect(await second.all('PRAGMA user_version')).toEqual([
        { user_version: MIGRATIONS.length },
      ]);
      expect(await rowsOf(second)).toBe(1);
    });
  });

  describe('a key that is lost, rejected or a file that is not a database', () => {
    const lostKey = (device: Device) => device.storage.remove(SECURE_STORAGE_KEY.DatabaseKey);
    const wrongKey = (device: Device) =>
      device.storage.set(
        SECURE_STORAGE_KEY.DatabaseKey,
        formatKeyState({ generation: 0, key: OTHER_KEY }),
      );
    const brokenFile = (device: Device) => {
      device.opener.corrupt(device.name);
    };

    describe.each([
      ['the key is not in the keychain', RESET_REASON.KeyLost, lostKey, true],
      ['the keychain holds another key', RESET_REASON.KeyRejected, wrongKey, true],
      ['the file is not a database', RESET_REASON.KeyRejected, brokenFile, false],
    ])('when %s', (_name, reason, lose, readable) => {
      it('sets the file aside, unread and not deleted, and starts a new database, empty, in another file', async () => {
        const device = aDevice();
        const first = await started(device);
        await mark(first);
        await first.close();
        const originalKey = keyOf(device);
        await lose(device);

        const second = await started(device);

        expect(await rowsOf(second)).toBe(0);
        expect(device.files.exists(device.name)).toBe(true);
        expect(device.files.exists(databaseFileName(device.name, 1))).toBe(true);
        expect(device.opener.removed).toEqual([]);
        expect(keyOf(device)).toMatch(STATE_FORMAT);
        expect(keyOf(device)).toContain('1:');
        expect(keyOf(device)).not.toContain(originalKey?.slice(-64) ?? 'x');
      });

      it('leaves the data of the old file where it was, readable with its own key when it can be read', async () => {
        const device = aDevice();
        const first = await started(device);
        await mark(first);
        await first.close();
        const originalKey = keyOf(device)?.slice(-64) ?? '';
        await lose(device);

        await started(device);

        // A file that is not a database is readable by nobody: only that it was kept can be seen.
        expect(device.files.exists(device.name)).toBe(true);
        const old = await device.opener.open(device.name);
        const unlocked = await unlockDatabase(old, originalKey);
        expect(unlocked.ok).toBe(readable);
        if (readable) {
          expect(
            await old.all(`SELECT count(*) AS total FROM ${TABLE.MeetingDetails}`, []),
          ).toEqual([{ total: 1 }]);
        }
      });

      it('reports it as an error to the monitoring, with the reason, and not as a log', async () => {
        const device = aDevice();
        const first = await started(device);
        await first.close();
        await lose(device);

        await started(device);

        expect(device.monitoring.errors).toEqual([
          {
            event: MONITORING_EVENT.DatabaseRecreated,
            error: storageReadFailed(reason),
            attributes: { [LOG_ATTRIBUTE.Reason]: reason },
          },
        ]);
        expect(device.monitoring.logs).toEqual([]);
      });

      it('leaves a record in the keychain that local data was reset, with the reason', async () => {
        const device = aDevice();
        const first = await started(device);
        await first.close();
        await lose(device);

        await started(device);

        expect(device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBe(reason);
      });

      it('uses the new file at the starts after, and the record stays until somebody clears it', async () => {
        const device = aDevice();
        const first = await started(device);
        await first.close();
        await lose(device);
        const second = await started(device);
        await mark(second);
        await second.close();

        const third = await started(device);

        expect(await rowsOf(third)).toBe(1);
        expect(device.monitoring.errors).toHaveLength(1);
        expect(device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBe(reason);
      });
    });

    it('keeps the key that did not open the file when the keychain had one, and none when it had not', async () => {
      const rejected = aDevice();
      await (await started(rejected)).close();
      const originalKey = keyOf(rejected) ?? '';
      await wrongKey(rejected);
      await started(rejected);

      const lost = aDevice();
      await (await started(lost)).close();
      await lostKey(lost);
      await started(lost);

      expect(rejected.storage.snapshot()[SECURE_STORAGE_KEY.DatabaseKeyPrevious]).toBe(
        formatKeyState({ generation: 0, key: OTHER_KEY }),
      );
      expect(originalKey).toMatch(STATE_FORMAT);
      expect(lost.storage.snapshot()[SECURE_STORAGE_KEY.DatabaseKeyPrevious]).toBeUndefined();
    });

    it('keeps at most one copy: the second reset removes the copy of the first', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await wrongKey(device);
      await (await started(device)).close();
      // The file of generation 1 is lost in its turn.
      device.storage.seed(
        SECURE_STORAGE_KEY.DatabaseKey,
        formatKeyState({ generation: 1, key: OTHER_KEY }),
      );

      const third = await started(device);

      expect(await rowsOf(third)).toBe(0);
      expect(device.files.exists(databaseFileName(device.name, 2))).toBe(true);
      expect(device.files.exists(databaseFileName(device.name, 1))).toBe(true);
      expect(device.files.exists(databaseFileName(device.name, 0))).toBe(false);
      expect(device.opener.removed).toEqual([databaseFileName(device.name, 0)]);
    });

    it('resets at most once in a start: a new file that is no good either is a failure to open', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await lostKey(device);
      device.opener.corrupt(databaseFileName(device.name, 1));

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(device.files.exists(device.name)).toBe(true);
    });

    it('is told before anything is set aside: a record, then the key, then the file', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await wrongKey(device);
      const order: string[] = [];
      const set = device.storage.set.bind(device.storage);
      jest.spyOn(device.storage, 'set').mockImplementation(async (key, value) => {
        order.push(key);
        return set(key, value);
      });
      const open = device.opener.open.bind(device.opener);
      jest.spyOn(device.opener, 'open').mockImplementation(async (file) => {
        order.push(`open ${file}`);
        return open(file);
      });

      await started(device);

      expect(order).toEqual([
        `open ${device.name}`,
        SECURE_STORAGE_KEY.LocalDataReset,
        SECURE_STORAGE_KEY.DatabaseKeyPrevious,
        SECURE_STORAGE_KEY.DatabaseKey,
        `open ${databaseFileName(device.name, 1)}`,
      ]);
    });

    it('does not set anything aside when the record cannot be written, and the key is untouched', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await wrongKey(device);
      const before = keyOf(device);
      const set = device.storage.set.bind(device.storage);
      jest
        .spyOn(device.storage, 'set')
        .mockImplementation((key, value) =>
          key === SECURE_STORAGE_KEY.LocalDataReset
            ? Promise.reject(new Error('full'))
            : set(key, value),
        );

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(keyOf(device)).toBe(before);
      expect(device.files.exists(databaseFileName(device.name, 1))).toBe(false);
      expect(device.monitoring.errors).toEqual([]);
    });

    it('does not start over when the new key cannot be kept: the file is not set aside', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await wrongKey(device);
      const before = keyOf(device);
      const set = device.storage.set.bind(device.storage);
      jest
        .spyOn(device.storage, 'set')
        .mockImplementation((key, value) =>
          key === SECURE_STORAGE_KEY.DatabaseKey
            ? Promise.reject(new Error('full'))
            : set(key, value),
        );

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(keyOf(device)).toBe(before);
      expect(device.monitoring.errors).toEqual([]);
      expect(device.opener.removed).toEqual([]);
    });

    it('goes on when the previous key cannot be kept: it is only a help', async () => {
      const device = aDevice();
      await (await started(device)).close();
      await wrongKey(device);
      const set = device.storage.set.bind(device.storage);
      jest
        .spyOn(device.storage, 'set')
        .mockImplementation((key, value) =>
          key === SECURE_STORAGE_KEY.DatabaseKeyPrevious
            ? Promise.reject(new Error('full'))
            : set(key, value),
        );

      const second = await started(device);

      expect(await rowsOf(second)).toBe(0);
    });

    it('finishes the reset at the next start when the app stopped after the key was renewed', async () => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      await wrongKey(device);
      device.opener.failNextOpens(0);
      // The start stops when the new file is opened for the first time.
      const open = device.opener.open.bind(device.opener);
      let opens = 0;
      jest.spyOn(device.opener, 'open').mockImplementation((file) => {
        opens += 1;
        return opens === 2 ? Promise.reject(new Error('killed')) : open(file);
      });
      const stopped = await device.start();
      jest.restoreAllMocks();

      const restarted = await started(device);

      expect(stopped.ok).toBe(false);
      expect(await rowsOf(restarted)).toBe(0);
      expect(device.monitoring.errors).toHaveLength(1);
      expect(device.files.exists(device.name)).toBe(true);
      expect(device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBe(
        RESET_REASON.KeyRejected,
      );
    });
  });

  describe('a keychain that cannot be trusted', () => {
    it.each([
      ['text that is not a key', 'not a key'],
      ['a key of the wrong length', 'a'.repeat(63)],
      ['a key in upper case', 'A'.repeat(64)],
      ['an empty value', ''],
      ['a generation with no key', '1:'],
      ['a generation that is not a number', 'x:' + 'a'.repeat(64)],
    ])('fails closed for %s: nothing is made, set aside or deleted', async (_name, value) => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, value);

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(device.storage.snapshot()[SECURE_STORAGE_KEY.DatabaseKey]).toBe(value);
      expect(device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBeUndefined();
      expect(device.opener.removed).toEqual([]);
      expect(device.monitoring.errors).toEqual([]);
      expect(device.files.exists(device.name)).toBe(true);
    });

    it('reads the key an app that knew one file kept, as the key of the first file', async () => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      const key = keyOf(device)?.slice(-64) ?? '';
      device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, key);

      const second = await started(device);

      expect(await rowsOf(second)).toBe(1);
      expect(device.monitoring.errors).toEqual([]);
    });
  });

  describe('two starts at once on the same keychain', () => {
    it('make one key, and the database both open is the one with the data', async () => {
      const device = aDevice();

      const [one, other] = await Promise.all([device.start(), device.start()]);

      expect(one.ok && other.ok).toBe(true);
      if (!one.ok || !other.ok) return;
      await mark(one.value);
      expect(await rowsOf(other.value)).toBe(1);
      expect(new Set(device.opener.keysUsed).size).toBe(1);
      expect(device.monitoring.errors).toEqual([]);
      expect(device.storage.snapshot()[SECURE_STORAGE_KEY.LocalDataReset]).toBeUndefined();
    });

    it('do not hold each other up when the keychains are not the same', async () => {
      const first = aDevice();
      const second = aDevice();
      first.storage.hang();

      const [stuck, free] = await Promise.all([first.start({ timeoutMillis: 20 }), second.start()]);

      expect(stuck.ok).toBe(false);
      expect(free.ok).toBe(true);
    });

    it('go on one after the other when the first fails', async () => {
      const device = aDevice();
      device.storage.failNext();

      const [failed, retried] = await Promise.all([device.start(), device.start()]);

      expect(failed.ok).toBe(false);
      expect(retried.ok).toBe(true);
    });
  });

  describe('when the keychain does not work', () => {
    it('does not start, and touches nothing, when the key cannot be read', async () => {
      const device = aDevice();
      device.storage.failNext();

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(device.opener.keysUsed).toEqual([]);
    });

    it('does not create the database when the key it made cannot be kept', async () => {
      const device = aDevice();
      let reads = 0;
      const set = device.storage.set.bind(device.storage);
      jest.spyOn(device.storage, 'set').mockImplementation(async (key, value) => {
        reads += 1;
        return reads === 1 ? Promise.reject(new Error('full')) : set(key, value);
      });

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(device.opener.has(device.name)).toBe(false);
    });

    it('does not wait for ever for a keychain that does not answer', async () => {
      const device = aDevice();
      device.storage.hang();

      const opened = await device.start({ timeoutMillis: 20 });

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
    });
  });

  describe('where the key comes from', () => {
    it('draws 32 bytes from the random source it is given, and keeps them as 64 lower-case hexadecimal digits', async () => {
      const asked: number[] = [];
      const bytes = Uint8Array.from({ length: 32 }, (_, index) => 0xa0 + index);
      const device = aDevice({
        randomBytes: (count) => {
          asked.push(count);
          return Promise.resolve(bytes);
        },
      });

      await started(device);

      expect(asked).toEqual([32]);
      expect(keyOf(device)).toBe(
        `0:${'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf'}${'b0b1b2b3b4b5b6b7b8b9babbbcbdbebf'}`,
      );
    });

    it('draws again for the key of the next file when the database is reset', async () => {
      const asked: number[] = [];
      const device = aDevice({
        randomBytes: (count) => {
          asked.push(count);
          return nodeRandomBytes(count);
        },
      });
      const first = await started(device);
      await first.close();
      device.opener.corrupt(device.name);

      await started(device);

      expect(asked).toEqual([32, 32]);
    });

    it('opens a database made by an earlier version, whose key was made by SQLite in the same form', async () => {
      const device = aDevice();
      const database = await started(device);
      await mark(database);
      await database.close();
      const kept = keyOf(device);

      const again = await started(device);

      expect(await rowsOf(again)).toBe(1);
      expect(keyOf(device)).toBe(kept);
    });
  });

  describe('when no random key can be made', () => {
    const failed = {
      ok: false,
      error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
    };

    const generators: [string, () => Promise<unknown>][] = [
      ['the generator rejects', () => Promise.reject(new Error('no entropy'))],
      [
        'the generator throws',
        () => {
          throw new Error('no entropy');
        },
      ],
      ['it answers too few bytes', () => Promise.resolve(new Uint8Array(16).fill(7))],
      ['it answers too many bytes', () => Promise.resolve(new Uint8Array(33).fill(7))],
      ['it answers nothing', () => Promise.resolve(new Uint8Array(0))],
      ['it answers zeros', () => Promise.resolve(new Uint8Array(32))],
      ['it answers something that is not bytes', () => Promise.resolve('0'.repeat(64))],
      [
        'it answers an array of numbers',
        () => Promise.resolve(Array.from({ length: 32 }, () => 7)),
      ],
    ];

    it.each(generators)(
      'does not start, and stores and creates nothing, when %s',
      async (_name, generator) => {
        const device = aDevice({
          randomBytes: generator as ProtectedDatabaseOptions['randomBytes'],
        });

        const opened = await device.start();

        expect(opened).toEqual(failed);
        expect(device.storage.snapshot()).toEqual({});
        expect(device.opener.has(device.name)).toBe(false);
      },
    );

    it('does not wait for ever for a generator that does not answer', async () => {
      const device = aDevice({ randomBytes: () => new Promise<Uint8Array>(() => undefined) });

      const opened = await device.start({ timeoutMillis: 20 });

      expect(opened).toEqual(failed);
      expect(device.storage.snapshot()).toEqual({});
    });

    it('starts when the generator works again', async () => {
      let failing = true;
      const device = aDevice({
        randomBytes: (count) =>
          failing ? Promise.reject(new Error('no entropy')) : nodeRandomBytes(count),
      });
      expect(await device.start()).toEqual(failed);

      failing = false;

      expect((await device.start()).ok).toBe(true);
    });
  });

  describe('when the database cannot be had', () => {
    it('refuses to store anything in clear when the engine cannot encrypt, and says why', async () => {
      const device = aDevice();
      device.opener.setCipher(false);

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.EncryptionUnavailable },
      });
      expect(device.opener.has(device.name)).toBe(false);
    });

    it('does not delete a database it merely failed to open', async () => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      device.opener.failNextOpens();

      const failed = await device.start();
      const again = await started(device);

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(await rowsOf(again)).toBe(1);
      expect(device.monitoring.errors).toEqual([]);
      expect(device.opener.removed).toEqual([]);
    });

    it('goes on when the copy of an earlier reset cannot be removed: it is only disk space', async () => {
      const device = aDevice();
      await (await started(device)).close();
      device.storage.seed(
        SECURE_STORAGE_KEY.DatabaseKey,
        formatKeyState({ generation: 1, key: OTHER_KEY }),
      );
      jest.spyOn(device.opener, 'remove').mockRejectedValue(new Error('locked'));

      const second = await device.start();

      expect(second.ok).toBe(true);
    });

    it('does not wait for ever for an engine that does not answer', async () => {
      const device = aDevice();
      jest.spyOn(device.opener, 'open').mockReturnValue(new Promise(() => undefined));

      const failed = await device.start({ timeoutMillis: 20 });

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
    });

    it('reports a schema that cannot be brought up to date, and closes the database', async () => {
      const device = aDevice();
      const connections = watchConnections(device);
      const broken: Migration = {
        version: MIGRATIONS.length + 1,
        statements: ['INSERT INTO nowhere VALUES (1)'],
      };

      const failed = await device.start({ migrations: [...MIGRATIONS, broken] });

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Migration },
      });
      expect(connections.opened).toBe(1);
      expect(connections.closed).toBe(1);
    });

    it('closes the database of a newer version of the app that it leaves alone', async () => {
      const device = aDevice();
      const newer: Migration = {
        version: MIGRATIONS.length + 1,
        statements: ['CREATE TABLE later (id INTEGER)'],
      };
      const future = await device.start({ migrations: [...MIGRATIONS, newer] });
      if (!future.ok) throw new Error('should have opened');
      await future.value.close();
      const connections = watchConnections(device);

      await device.start();

      expect(connections.closed).toBe(connections.opened);
    });

    it('closes the connection of a file that does not unlock, and of one the engine cannot encrypt', async () => {
      const rejected = aDevice();
      await (await started(rejected)).close();
      rejected.storage.seed(
        SECURE_STORAGE_KEY.DatabaseKey,
        formatKeyState({ generation: 0, key: OTHER_KEY }),
      );
      const rejections = watchConnections(rejected);
      await started(rejected);

      const plain = aDevice();
      plain.opener.setCipher(false);
      const plains = watchConnections(plain);
      await plain.start();

      // The first one is closed, the second is the new database, which stays open.
      expect(rejections.opened - rejections.closed).toBe(1);
      expect(plains.opened).toBe(1);
      expect(plains.closed).toBe(1);
    });

    it('reports a database written by a more recent version of the app, and leaves it alone', async () => {
      const device = aDevice();
      const newer: Migration = {
        version: MIGRATIONS.length + 1,
        statements: ['CREATE TABLE later (id INTEGER)'],
      };
      const future = await device.start({ migrations: [...MIGRATIONS, newer] });
      if (!future.ok) throw new Error('should have opened');
      await future.value.close();

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.DatabaseIsNewer },
      });
      const reopened = await device.start({ migrations: [...MIGRATIONS, newer] });
      expect(reopened.ok).toBe(true);
      expect(device.monitoring.logs).toEqual([]);
    });
  });
});
