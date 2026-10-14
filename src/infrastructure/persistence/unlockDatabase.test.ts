import { NodeSqliteOpener, nodeFileSystem } from '../testing/NodeSqlite';
import { SimulatedCipherOpener } from '../testing/SimulatedCipherOpener';
import { databaseDirectory } from '../testing/testDatabase';

import type { EngineConnection } from './DatabaseOpener';
import { UNLOCK_FAILURE, unlockDatabase } from './unlockDatabase';

const directory = databaseDirectory();
const KEY = 'a'.repeat(64);
const OTHER_KEY = 'b'.repeat(64);

let counter = 0;

function aFile() {
  counter += 1;
  const opener = new SimulatedCipherOpener(new NodeSqliteOpener(directory, nodeFileSystem()));
  return { opener, name: `unlock-${counter}.db` };
}

/** A connection that records what it is sent and answers what the test scripted. */
function scripted(script: {
  readonly cipherRows?: readonly Record<string, string>[];
  readonly readFails?: unknown;
  readonly execFails?: unknown;
  readonly closeFails?: boolean;
}) {
  const statements: string[] = [];
  let closed = 0;
  const connection: EngineConnection = {
    exec: (sql) => {
      statements.push(sql);
      return script.execFails === undefined ? Promise.resolve() : Promise.reject(script.execFails);
    },
    run: () => Promise.resolve({ changes: 0 }),
    all: (sql) => {
      statements.push(sql);
      if (sql === 'PRAGMA cipher_version')
        return Promise.resolve(script.cipherRows ?? [{ v: '4' }]);
      return script.readFails === undefined
        ? Promise.resolve([])
        : Promise.reject(script.readFails);
    },
    close: () => {
      closed += 1;
      return script.closeFails === true ? Promise.reject(new Error('stuck')) : Promise.resolve();
    },
  };
  return { connection, statements, closed: () => closed };
}

describe('unlockDatabase', () => {
  it('unlocks with the key as a raw key, checks it is SQLCipher, and reads the file', async () => {
    const { connection, statements, closed } = scripted({});

    const unlocked = await unlockDatabase(connection, KEY);

    expect(unlocked).toEqual({ ok: true, value: undefined });
    expect(statements).toEqual([
      `PRAGMA key = "x'${KEY}'"`,
      'PRAGMA cipher_version',
      'SELECT count(*) FROM sqlite_master',
    ]);
    expect(closed()).toBe(0);
  });

  it('opens a file again with the key it was created with', async () => {
    const { opener, name } = aFile();
    const created = await opener.open(name);
    await unlockDatabase(created, KEY);
    await created.close();

    const again = await unlockDatabase(await opener.open(name), KEY);

    expect(again.ok).toBe(true);
  });

  it('says the key is rejected when the file was created with another key, and closes the connection', async () => {
    const { opener, name } = aFile();
    const created = await opener.open(name);
    await unlockDatabase(created, KEY);
    await created.close();
    const other = scripted({ readFails: new Error('file is not a database') });

    const rejected = await unlockDatabase(await opener.open(name), OTHER_KEY);
    const scriptedRejected = await unlockDatabase(other.connection, KEY);

    expect(rejected).toEqual({ ok: false, error: UNLOCK_FAILURE.KeyRejected });
    expect(scriptedRejected).toEqual({ ok: false, error: UNLOCK_FAILURE.KeyRejected });
    expect(other.closed()).toBe(1);
  });

  it.each([
    ['the message in other letters', new Error('NOT A DATABASE')],
    ['the message with words around it', new Error('sqlite3: file is not a database (26)')],
    [
      'the result code, from an engine that gives one',
      Object.assign(new Error('x'), { errcode: 26 }),
    ],
  ])('recognises a file that is not a database by %s', async (_name, failure) => {
    const { connection } = scripted({ readFails: failure });

    expect(await unlockDatabase(connection, KEY)).toEqual({
      ok: false,
      error: UNLOCK_FAILURE.KeyRejected,
    });
  });

  it.each([
    ['a failure with another message', new Error('disk I/O error')],
    ['a failure with another code', Object.assign(new Error('busy'), { errcode: 5 })],
    ['something that is not an error', 'oops'],
    ['nothing', undefined],
  ])('says it failed, not that the key is rejected, for %s', async (_name, failure) => {
    const { connection, closed } = scripted({ readFails: failure ?? null });
    const thrown = scripted({ execFails: failure ?? null });

    expect(await unlockDatabase(connection, KEY)).toEqual({
      ok: false,
      error: UNLOCK_FAILURE.Failed,
    });
    expect(await unlockDatabase(thrown.connection, KEY)).toEqual({
      ok: false,
      error: UNLOCK_FAILURE.Failed,
    });
    expect(closed()).toBe(1);
    expect(thrown.closed()).toBe(1);
  });

  it('refuses to store anything when the engine is plain SQLite, which would ignore the key', async () => {
    const { connection, statements, closed } = scripted({ cipherRows: [] });

    expect(await unlockDatabase(connection, KEY)).toEqual({
      ok: false,
      error: UNLOCK_FAILURE.EncryptionUnavailable,
    });
    expect(statements).not.toContain('SELECT count(*) FROM sqlite_master');
    expect(closed()).toBe(1);
  });

  it('survives a connection that does not close', async () => {
    const { connection } = scripted({
      readFails: new Error('file is not a database'),
      closeFails: true,
    });

    expect(await unlockDatabase(connection, KEY)).toEqual({
      ok: false,
      error: UNLOCK_FAILURE.KeyRejected,
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
      const { connection, statements, closed } = scripted({});

      expect(await unlockDatabase(connection, key)).toEqual({
        ok: false,
        error: UNLOCK_FAILURE.Failed,
      });
      expect(statements).toEqual([]);
      expect(closed()).toBe(1);
    },
  );
});
