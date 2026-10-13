import { OPEN_FAILURE } from './DatabaseOpener';
import { ExpoSqliteOpener } from './ExpoSqliteOpener';
import { createSqlDatabase } from './SqlDatabase';
import { fakeExpoSqlite, resetFakeExpoSqlite } from '../testing/fakeExpoSqlite';

// The native side of expo-sqlite cannot run in Jest, so the module is replaced by a stand-in that
// runs the statements on node:sqlite and answers like SQLCipher does to a key and to its version
// (src/infrastructure/testing/fakeExpoSqlite.ts). What is left to check in a wrapper this thin is
// the conversation with the module.
jest.mock('expo-sqlite', () => jest.requireActual('../testing/fakeExpoSqlite'));

const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);
const NAME = 'boardroom.db';

beforeEach(() => {
  resetFakeExpoSqlite();
});

describe('ExpoSqliteOpener', () => {
  it('unlocks the database with the key as a raw key, checks it is SQLCipher, and reads the file', async () => {
    const opened = await new ExpoSqliteOpener().open(NAME, KEY);

    expect(opened.ok).toBe(true);
    expect(fakeExpoSqlite.statements).toEqual([
      `PRAGMA key = "x'${KEY}'"`,
      'PRAGMA cipher_version',
      'SELECT count(*) FROM sqlite_master',
    ]);
  });

  it('gives a connection that runs statements with their parameters and reads rows', async () => {
    const opened = await new ExpoSqliteOpener().open(NAME, KEY);
    if (!opened.ok) throw new Error('should have opened');
    const database = createSqlDatabase(opened.value);

    await database.run('CREATE TABLE t (a TEXT, b INTEGER)');
    const inserted = await database.run('INSERT INTO t VALUES (?, ?)', ['x', 7]);
    const rows = await database.all('SELECT a, b FROM t WHERE b = ?', [7]);
    await database.transaction(async (tx) => {
      await tx.run('INSERT INTO t VALUES (?, ?)', ['y', 8]);
    });

    expect(inserted).toEqual({ changes: 1 });
    expect(rows.map((row) => ({ ...row }))).toEqual([{ a: 'x', b: 7 }]);
    expect(await database.all('SELECT count(*) AS total FROM t')).toEqual([{ total: 2 }]);
    await database.close();
    expect(fakeExpoSqlite.open.size).toBe(0);
  });

  it('says the key is rejected when the file was created with another key', async () => {
    const opener = new ExpoSqliteOpener();
    await opener.open(NAME, KEY);

    const opened = await opener.open(NAME, OTHER_KEY);

    expect(opened).toEqual({ ok: false, error: OPEN_FAILURE.KeyRejected });
  });

  it('closes a database it could not unlock, so no connection is left open', async () => {
    const opener = new ExpoSqliteOpener();
    await opener.open(NAME, KEY);
    const before = fakeExpoSqlite.open.size;

    await opener.open(NAME, OTHER_KEY);

    expect(fakeExpoSqlite.open.size).toBe(before);
  });

  it('refuses to store anything when the engine is plain SQLite, which would ignore the key', async () => {
    fakeExpoSqlite.sqlcipher = false;

    const opened = await new ExpoSqliteOpener().open(NAME, KEY);

    expect(opened).toEqual({ ok: false, error: OPEN_FAILURE.EncryptionUnavailable });
    expect(fakeExpoSqlite.open.size).toBe(0);
  });

  it('says it failed, not that the key is rejected, for any other failure', async () => {
    fakeExpoSqlite.failOpenWith = 'disk full';

    expect(await new ExpoSqliteOpener().open(NAME, KEY)).toEqual({
      ok: false,
      error: OPEN_FAILURE.Failed,
    });
  });

  it('survives a database that does not close', async () => {
    const opener = new ExpoSqliteOpener();
    await opener.open(NAME, KEY);
    fakeExpoSqlite.failClose = true;

    expect(await opener.open(NAME, OTHER_KEY)).toEqual({
      ok: false,
      error: OPEN_FAILURE.KeyRejected,
    });
  });

  it.each([
    '',
    'short',
    'g'.repeat(64),
    `${KEY}0`,
    `"; DROP TABLE x; --`.padEnd(64, 'a'),
    KEY.toUpperCase(),
  ])(
    'refuses a key that is not 64 lower case hexadecimal digits, before it reaches a statement: %j',
    async (key) => {
      const opened = await new ExpoSqliteOpener().open(NAME, key);

      expect(opened).toEqual({ ok: false, error: OPEN_FAILURE.Failed });
      expect(fakeExpoSqlite.statements).toEqual([]);
    },
  );

  it('opens a scratch database in memory, with no key', async () => {
    const scratch = await new ExpoSqliteOpener().openScratch();

    expect(await createSqlDatabase(scratch).all('SELECT 1 AS one')).toEqual([{ one: 1 }]);
    expect(fakeExpoSqlite.statements).toEqual(['SELECT 1 AS one']);
  });

  it('deletes the file of a database', async () => {
    const opener = new ExpoSqliteOpener();
    await opener.open(NAME, KEY);

    await opener.delete(NAME);

    expect(await opener.open(NAME, OTHER_KEY)).toMatchObject({ ok: true });
  });
});
