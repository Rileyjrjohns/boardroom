import { fakeExpoSqlite, resetFakeExpoSqlite } from '../testing/fakeExpoSqlite';

import { ExpoSqliteOpener } from './ExpoSqliteOpener';
import { createSqlDatabase } from './SqlDatabase';

// The native side of expo-sqlite cannot run in Jest, so the module is replaced by a stand-in that
// runs the statements on node:sqlite and answers like the module does to the calls the wrapper
// makes (src/core/infrastructure/testing/fakeExpoSqlite.ts). The wrapper decides nothing: what is left
// to check is the conversation with the module. What to do with a key is tested in
// `unlockDatabase.test.ts` and `protectedDatabase.test.ts`.
jest.mock('expo-sqlite', () => jest.requireActual('../testing/fakeExpoSqlite'));

const NAME = 'boardroom.db';

beforeEach(() => {
  resetFakeExpoSqlite();
});

describe('ExpoSqliteOpener', () => {
  it('opens the file by its name and sends no statement of its own', async () => {
    await new ExpoSqliteOpener().open(NAME);

    expect(fakeExpoSqlite.files.has(NAME)).toBe(true);
    expect(fakeExpoSqlite.statements).toEqual([]);
  });

  it('gives a connection that runs statements with their parameters and reads rows', async () => {
    const connection = await new ExpoSqliteOpener().open(NAME);
    const database = createSqlDatabase(connection);

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

  it('runs a statement that takes no parameter and answers nothing, as it is', async () => {
    const connection = await new ExpoSqliteOpener().open(NAME);

    await connection.exec('PRAGMA key = "x\'abc\'"');

    expect(fakeExpoSqlite.statements).toEqual(['PRAGMA key = "x\'abc\'"']);
  });

  it('lets what the module says go, for the caller to turn into a result', async () => {
    fakeExpoSqlite.failOpenWith = 'disk full';

    await expect(new ExpoSqliteOpener().open(NAME)).rejects.toThrow('disk full');
  });

  describe('removing a database', () => {
    it('deletes the file of a database that is closed', async () => {
      const opener = new ExpoSqliteOpener();
      const connection = await opener.open(NAME);
      await connection.close();

      await opener.remove(NAME);

      expect(fakeExpoSqlite.files.has(NAME)).toBe(false);
    });

    it('succeeds for a database that is not there, which the module rejects', async () => {
      await expect(new ExpoSqliteOpener().remove(NAME)).resolves.toBeUndefined();
    });

    it('lets any other failure go: a database that is open cannot be deleted', async () => {
      const opener = new ExpoSqliteOpener();
      await opener.open(NAME);

      await expect(opener.remove(NAME)).rejects.toThrow('it is open');
      expect(fakeExpoSqlite.files.has(NAME)).toBe(true);
    });
  });
});
