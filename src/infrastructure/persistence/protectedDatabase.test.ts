import { LOG_ATTRIBUTE, LOG_LEVEL, MONITORING_EVENT } from '@application/ports/Monitoring';
import { FakeMonitoring } from '@application/testing/FakeMonitoring';

import { MemorySecureStorage } from '../testing/MemorySecureStorage';
import { NodeSqliteOpener, nodeFileSystem } from '../testing/NodeSqlite';
import { SimulatedCipherOpener } from '../testing/SimulatedCipherOpener';
import { databaseDirectory } from '../testing/testDatabase';
import { SECURE_STORAGE_KEY } from '../secure-storage/SecureStorage';

import { OPEN_FAILURE } from './DatabaseOpener';
import { MIGRATIONS } from './migrations';
import type { Migration } from './migrations';
import { DATABASE_FAILURE, RECREATION_REASON, openProtectedDatabase } from './protectedDatabase';
import type { ProtectedDatabaseOptions } from './protectedDatabase';
import type { SqlDatabase } from './SqlDatabase';
import { TABLE } from './schema';

const directory = databaseDirectory();
const files = nodeFileSystem();
const KEY_FORMAT = /^[0-9a-f]{64}$/;

let counter = 0;

/** A device: a keychain, a file system and the logs, that survive the app being started again. */
function aDevice(overrides: Partial<ProtectedDatabaseOptions> = {}) {
  counter += 1;
  const storage = new MemorySecureStorage();
  const monitoring = new FakeMonitoring();
  const opener = new SimulatedCipherOpener(new NodeSqliteOpener(directory, files));
  const name = `protected-${counter}.db`;
  const options = { opener, storage, monitoring, name, migrations: MIGRATIONS, ...overrides };
  return {
    storage,
    monitoring,
    opener,
    name,
    /** A start of the app. */
    start: (more: Partial<ProtectedDatabaseOptions> = {}) =>
      openProtectedDatabase({ ...options, ...more }),
  };
}

async function started(device: ReturnType<typeof aDevice>): Promise<SqlDatabase> {
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
      expect(key).toMatch(KEY_FORMAT);
      expect(device.opener.keysUsed).toEqual([key]);
      expect(await database.all('PRAGMA user_version')).toEqual([
        { user_version: MIGRATIONS.length },
      ]);
      expect(device.monitoring.logs).toEqual([]);
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
      device.opener.failNextOpenWith(OPEN_FAILURE.Failed);

      const stopped = await device.start();

      expect(stopped).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(keyOf(device)).toMatch(KEY_FORMAT);
      expect(device.opener.has(device.name)).toBe(false);

      const database = await started(device);
      expect(await database.all('PRAGMA user_version')).toEqual([
        { user_version: MIGRATIONS.length },
      ]);
      expect(device.opener.keysUsed[0]).toBe(device.opener.keysUsed[1]);
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
      expect(device.opener.keysUsed).toEqual([key, key]);
      expect(device.monitoring.logs).toEqual([]);
    });

    it('migrates a database from an older version of the app', async () => {
      const device = aDevice();
      const first = await openProtectedDatabase({
        opener: device.opener,
        storage: device.storage,
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

  describe.each([
    [
      'the keychain holds something that is not a key, which is a key lost',
      RECREATION_REASON.KeyLost,
      (device: ReturnType<typeof aDevice>) =>
        device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, 'not a key'),
    ],
    [
      'the keychain holds another key',
      RECREATION_REASON.KeyRejected,
      (device: ReturnType<typeof aDevice>) =>
        device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, 'c'.repeat(64)),
    ],
  ])('when %s', (_name, reason, lose) => {
    it('deletes the database that cannot be read, makes a new key and starts over, empty', async () => {
      const device = aDevice();
      const first = await started(device);
      await mark(first);
      await first.close();
      const lostKey = keyOf(device);
      lose(device);

      const second = await started(device);

      expect(await rowsOf(second)).toBe(0);
      expect(keyOf(device)).toMatch(KEY_FORMAT);
      expect(keyOf(device)).not.toBe(lostKey);
      expect(device.monitoring.logs).toEqual([
        {
          level: LOG_LEVEL.Warn,
          event: MONITORING_EVENT.DatabaseRecreated,
          attributes: { [LOG_ATTRIBUTE.Reason]: reason },
        },
      ]);
    });
  });

  it('calls a key that is missing from the keychain, with a database on the device, a lost key', async () => {
    const device = aDevice();
    const first = await started(device);
    await mark(first);
    await first.close();
    await device.storage.remove(SECURE_STORAGE_KEY.DatabaseKey);

    const second = await started(device);

    expect(await rowsOf(second)).toBe(0);
    expect(device.monitoring.logs).toEqual([
      {
        level: LOG_LEVEL.Warn,
        event: MONITORING_EVENT.DatabaseRecreated,
        attributes: { [LOG_ATTRIBUTE.Reason]: RECREATION_REASON.KeyLost },
      },
    ]);
  });

  it('keeps the new key in the keychain before it uses it to create the database again', async () => {
    const device = aDevice();
    const first = await started(device);
    await first.close();
    await device.storage.remove(SECURE_STORAGE_KEY.DatabaseKey);

    const second = await started(device);
    await second.close();

    expect(device.opener.keysUsed.at(-1)).toBe(keyOf(device));
    expect(await rowsOf(await started(device))).toBe(0);
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

  describe('when no random key can be made', () => {
    it('does not start when the scratch database cannot be opened', async () => {
      const device = aDevice();
      jest.spyOn(device.opener, 'openScratch').mockRejectedValue(new Error('no memory'));

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
    });

    it('does not start with a key that is not what it should be', async () => {
      const device = aDevice();
      const scratch = await device.opener.openScratch();
      jest.spyOn(scratch, 'all').mockResolvedValue([{ key: '0000' }]);
      jest.spyOn(device.opener, 'openScratch').mockResolvedValue(scratch);

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
      expect(device.storage.snapshot()).toEqual({});
    });

    it('does not start when the scratch database cannot be asked for a number', async () => {
      const device = aDevice();
      const scratch = await device.opener.openScratch();
      jest.spyOn(scratch, 'all').mockRejectedValue(new Error('broken'));
      jest.spyOn(device.opener, 'openScratch').mockResolvedValue(scratch);

      const opened = await device.start();

      expect(opened).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.KeyStorage },
      });
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
      device.opener.failNextOpenWith(OPEN_FAILURE.Failed);

      const failed = await device.start();
      const again = await started(device);

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(await rowsOf(again)).toBe(1);
      expect(device.monitoring.logs).toEqual([]);
    });

    it('does not start over when the file cannot be deleted', async () => {
      const device = aDevice();
      const first = await started(device);
      await first.close();
      await device.storage.remove(SECURE_STORAGE_KEY.DatabaseKey);
      jest.spyOn(device.opener, 'delete').mockRejectedValue(new Error('locked'));

      const failed = await device.start();

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(device.monitoring.logs).toEqual([]);
    });

    it('does not start over when the new key cannot be kept', async () => {
      const device = aDevice();
      const first = await started(device);
      await first.close();
      device.storage.seed(SECURE_STORAGE_KEY.DatabaseKey, 'c'.repeat(64));
      const set = jest.spyOn(device.storage, 'set').mockRejectedValue(new Error('full'));

      const failed = await device.start();

      expect(set).toHaveBeenCalled();
      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Open },
      });
      expect(device.monitoring.logs).toEqual([]);
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
      const broken: Migration = {
        version: MIGRATIONS.length + 1,
        statements: ['INSERT INTO nowhere VALUES (1)'],
      };

      const failed = await device.start({ migrations: [...MIGRATIONS, broken] });

      expect(failed).toEqual({
        ok: false,
        error: { code: 'databaseUnavailable', reason: DATABASE_FAILURE.Migration },
      });
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
