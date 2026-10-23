import { FaultyConnection } from '../testing/FaultyConnection';
import { IN_MEMORY_DATABASE, NodeSqliteConnection } from '../testing/NodeSqlite';

import { createSqlDatabase } from './SqlDatabase';

function openDatabase() {
  const faults = new FaultyConnection(new NodeSqliteConnection(IN_MEMORY_DATABASE));
  return { faults, database: createSqlDatabase(faults) };
}

async function withTable() {
  const opened = openDatabase();
  await opened.database.run('CREATE TABLE items (name TEXT NOT NULL, amount INTEGER)');
  return opened;
}

describe('createSqlDatabase', () => {
  it('runs a statement with its parameters and reads the rows back by column name', async () => {
    const { database } = await withTable();

    const inserted = await database.run('INSERT INTO items (name, amount) VALUES (?, ?)', ['a', 3]);
    await database.run('INSERT INTO items (name, amount) VALUES (?, ?)', ['b', null]);
    const rows = await database.all('SELECT name, amount FROM items WHERE name = ?', ['a']);

    expect(inserted).toEqual({ changes: 1 });
    expect(rows.map((row) => ({ ...row }))).toEqual([{ name: 'a', amount: 3 }]);
  });

  it('binds a parameter as a value, never as part of the statement', async () => {
    const { database } = await withTable();
    const hostile = "x'); DROP TABLE items; --";

    await database.run('INSERT INTO items (name) VALUES (?)', [hostile]);

    const rows = await database.all('SELECT name FROM items');
    expect(rows.map((row) => row.name)).toEqual([hostile]);
  });

  it('commits what a transaction did when its work resolves, and returns its value', async () => {
    const { database } = await withTable();

    const value = await database.transaction(async (tx) => {
      await tx.run('INSERT INTO items (name) VALUES (?)', ['a']);
      await tx.run('INSERT INTO items (name) VALUES (?)', ['b']);
      return (await tx.all('SELECT count(*) AS total FROM items'))[0]?.total;
    });

    expect(value).toBe(2);
    expect(await database.all('SELECT name FROM items ORDER BY name')).toHaveLength(2);
  });

  it('rolls back everything a transaction did when its work rejects, and passes the rejection on', async () => {
    const { database } = await withTable();
    await database.run('INSERT INTO items (name) VALUES (?)', ['kept']);

    const failed = database.transaction(async (tx) => {
      await tx.run('DELETE FROM items');
      await tx.run('INSERT INTO items (name) VALUES (?)', ['lost']);
      throw new Error('the work failed');
    });

    await expect(failed).rejects.toThrow('the work failed');
    expect((await database.all('SELECT name FROM items')).map((row) => row.name)).toEqual(['kept']);
  });

  it('rolls back and rejects when the commit itself fails', async () => {
    const { database, faults } = await withTable();

    const failed = database.transaction(async (tx) => {
      await tx.run('INSERT INTO items (name) VALUES (?)', ['a']);
      faults.failNext();
    });

    await expect(failed).rejects.toThrow();
    expect(await database.all('SELECT name FROM items')).toEqual([]);
    // The connection is not left in the middle of a transaction.
    await database.run('INSERT INTO items (name) VALUES (?)', ['b']);
    expect(await database.all('SELECT name FROM items')).toHaveLength(1);
  });

  it('does not start the work of a transaction that could not begin', async () => {
    const { database, faults } = await withTable();
    const work = jest.fn(() => Promise.resolve());
    faults.failNext();

    await expect(database.transaction(work)).rejects.toThrow();

    expect(work).not.toHaveBeenCalled();
  });

  it('refuses a statement sent through the transaction once it has ended', async () => {
    const { database } = await withTable();
    let leaked: Parameters<Parameters<typeof database.transaction>[0]>[0] | undefined;
    await database.transaction(async (tx) => {
      leaked = tx;
      await tx.run('INSERT INTO items (name) VALUES (?)', ['a']);
    });

    await expect(leaked?.run('INSERT INTO items (name) VALUES (?)', ['b'])).rejects.toThrow(
      'ended',
    );
    await expect(leaked?.all('SELECT * FROM items')).rejects.toThrow('ended');
    expect(await database.all('SELECT name FROM items')).toHaveLength(1);
  });

  it('runs statements one at a time in the order they were asked for', async () => {
    const { database } = await withTable();

    await Promise.all(
      [1, 2, 3, 4, 5].map((number) =>
        database.run('INSERT INTO items (name, amount) VALUES (?, ?)', ['n', number]),
      ),
    );

    const rows = await database.all('SELECT amount FROM items ORDER BY rowid');
    expect(rows.map((row) => row.amount)).toEqual([1, 2, 3, 4, 5]);
  });

  it('never lets a statement land inside the transaction of another caller', async () => {
    const { database } = await withTable();

    const slow = database.transaction(async (tx) => {
      await tx.run('INSERT INTO items (name) VALUES (?)', ['inside']);
      await new Promise((resolve) => setTimeout(resolve, 20));
      // If the lone statement below had landed in this transaction, this would see it.
      const seen = await tx.all('SELECT name FROM items');
      throw new Error(`rolled back after seeing ${seen.length} row`);
    });
    const lone = database.run('INSERT INTO items (name) VALUES (?)', ['outside']);

    await expect(slow).rejects.toThrow('after seeing 1 row');
    await lone;
    expect((await database.all('SELECT name FROM items')).map((row) => row.name)).toEqual([
      'outside',
    ]);
  });

  it('keeps working after a statement failed', async () => {
    const { database } = await withTable();

    await expect(database.run('INSERT INTO nowhere VALUES (1)')).rejects.toThrow();
    await database.run('INSERT INTO items (name) VALUES (?)', ['a']);

    expect(await database.all('SELECT name FROM items')).toHaveLength(1);
  });

  it('closes the connection after the statements asked for before', async () => {
    const { database } = await withTable();
    const inserting = database.run('INSERT INTO items (name) VALUES (?)', ['a']);

    await database.close();

    await expect(inserting).resolves.toEqual({ changes: 1 });
    await expect(database.all('SELECT 1')).rejects.toThrow();
  });
});
