import { PARTIAL_SUFFIX, createFileStore, isValidFileName } from './FileStore';
import { FaultyFileVolume } from '../testing/FaultyFileVolume';
import { NodeFileVolume, nodeFileStore } from '../testing/NodeFileVolume';
import { freshDirectory, temporaryDirectory } from '../testing/NodeSqlite';

// The store is tested over the file system of Node, which is the real thing, and over a volume that
// fails when it is told to. Nothing here depends on a device: the volume of a device only renames
// the calls (see ExpoFileVolume.test.ts).

const parent = temporaryDirectory();

const bytesOf = (...values: number[]): Uint8Array => Uint8Array.from(values);

interface NodeFs {
  readFileSync(path: string): Uint8Array;
  readdirSync(path: string): string[];
  existsSync(path: string): boolean;
  rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}
const nodeFs = process.getBuiltinModule('node:fs') as unknown as NodeFs;
const join = (...parts: string[]): string => parts.join('/');

function aStore() {
  const directory = join(freshDirectory(parent), 'documents');
  const faulty = new FaultyFileVolume(new NodeFileVolume(directory));
  return { directory, faulty, store: createFileStore(faulty, { timeoutMillis: 50 }) };
}

describe('the names of the files', () => {
  it.each(['a.pdf', 'document-1.pdf', 'A_b-c.1.pdf', '0'])('accepts %s', (name) => {
    expect(isValidFileName(name)).toBe(true);
  });

  it.each([
    ['nothing', ''],
    ['a path', 'a/b.pdf'],
    ['a path upwards', '../a.pdf'],
    ['a backslash', 'a\\b.pdf'],
    ['a name that starts with a dot', '.hidden'],
    ['a space', 'a b.pdf'],
    ['a percent sign', 'a%2Fb'],
    ['an accent', 'café.pdf'],
    ['a partial file', `a.pdf${PARTIAL_SUFFIX}`],
    ['a name that is too long', 'a'.repeat(129)],
  ])('refuses %s', (_what, name) => {
    expect(isValidFileName(name)).toBe(false);
  });
});

describe('FileStore', () => {
  describe('writing and reading back', () => {
    it('writes the bytes, and says that the file is there and how big it is', async () => {
      const { store, directory } = aStore();

      expect(await store.write('a.pdf', bytesOf(1, 2, 3))).toStrictEqual({
        ok: true,
        value: undefined,
      });

      expect(await store.stat('a.pdf')).toStrictEqual({ ok: true, value: { size: 3 } });
      expect(Array.from(nodeFs.readFileSync(join(directory, 'a.pdf')))).toEqual([1, 2, 3]);
    });

    it('makes its directory when there is none, and again if it is taken away', async () => {
      const { store, directory } = aStore();
      await store.write('a.pdf', bytesOf(1));
      nodeFs.rmSync(directory, { recursive: true, force: true });

      expect((await store.write('b.pdf', bytesOf(2))).ok).toBe(true);

      expect(await store.list()).toStrictEqual({ ok: true, value: ['b.pdf'] });
    });

    it('says nothing is there for a file it never had, without failing', async () => {
      const { store } = aStore();

      expect(await store.stat('missing.pdf')).toStrictEqual({ ok: true, value: undefined });
    });

    it('replaces a file written again under the same name', async () => {
      const { store } = aStore();
      await store.write('a.pdf', bytesOf(1, 2, 3));

      await store.write('a.pdf', bytesOf(9));

      expect(await store.stat('a.pdf')).toStrictEqual({ ok: true, value: { size: 1 } });
    });

    it('writes an empty file', async () => {
      const { store } = aStore();

      await store.write('empty.pdf', new Uint8Array(0));

      expect(await store.stat('empty.pdf')).toStrictEqual({ ok: true, value: { size: 0 } });
    });
  });

  describe('a write is whole or nothing', () => {
    it('leaves no partial file behind once it is done', async () => {
      const { store, directory } = aStore();

      await store.write('a.pdf', bytesOf(1, 2, 3));

      expect(nodeFs.readdirSync(directory)).toEqual(['a.pdf']);
    });

    it('never shows half a file under the name: the bytes are in a file of their own until the move', async () => {
      const { store, faulty, directory } = aStore();
      await store.write('a.pdf', bytesOf(1, 2, 3));
      faulty.fail('move', true);

      const failed = await store.write('a.pdf', bytesOf(9, 9));

      expect(failed.ok).toBe(false);
      // The previous file is as it was, and the partial one is gone.
      expect(Array.from(nodeFs.readFileSync(join(directory, 'a.pdf')))).toEqual([1, 2, 3]);
      expect(nodeFs.readdirSync(directory)).toEqual(['a.pdf']);
    });

    it('leaves nothing when the bytes cannot be written', async () => {
      const { store, faulty, directory } = aStore();
      faulty.fail('write', true);

      const failed = await store.write('a.pdf', bytesOf(1));

      expect(failed.ok).toBe(false);
      expect(nodeFs.readdirSync(directory)).toEqual([]);
    });

    it('uses a partial file name no other write uses, so that two writes at once do not meet', async () => {
      const { store } = aStore();

      const results = await Promise.all(
        [1, 2, 3, 4, 5].map((byte) => store.write('a.pdf', bytesOf(byte, byte))),
      );

      expect(results.every((result) => result.ok)).toBe(true);
      expect(await store.list()).toStrictEqual({ ok: true, value: ['a.pdf'] });
    });
  });

  describe('deleting', () => {
    it('deletes a file, and succeeds for one that is not there', async () => {
      const { store } = aStore();
      await store.write('a.pdf', bytesOf(1));

      expect((await store.delete('a.pdf')).ok).toBe(true);
      expect((await store.delete('a.pdf')).ok).toBe(true);

      expect(await store.stat('a.pdf')).toStrictEqual({ ok: true, value: undefined });
    });

    it('lists everything, files that were being written included', async () => {
      const { store } = aStore();
      await store.write('a.pdf', bytesOf(1));
      await store.write('b.pdf', bytesOf(2));

      const listed = await store.list();

      expect(listed.ok && [...listed.value].sort()).toEqual(['a.pdf', 'b.pdf']);
    });

    it('deletes everything, and succeeds when there is nothing', async () => {
      const { store } = aStore();
      expect((await store.deleteAll()).ok).toBe(true);
      await store.write('a.pdf', bytesOf(1));
      await store.write('b.pdf', bytesOf(2));

      expect((await store.deleteAll()).ok).toBe(true);

      expect(await store.list()).toStrictEqual({ ok: true, value: [] });
    });

    it('goes on after a file it cannot delete, takes the others, and fails', async () => {
      const { store, faulty } = aStore();
      await store.write('a.pdf', bytesOf(1));
      await store.write('b.pdf', bytesOf(2));
      await store.write('c.pdf', bytesOf(3));
      faulty.fail('remove', true);

      const failed = await store.deleteAll();

      expect(failed).toStrictEqual({ ok: false, error: { cause: 'EIO' } });
      // Every file was tried: three attempts, not one.
      expect(faulty.calls.remove).toBe(3);
    });
  });

  describe('locations', () => {
    it('makes the location of a file from the root of the volume, and reads the name back', () => {
      const { store, directory } = aStore();

      expect(store.uriOf('a.pdf')).toBe(`file://${directory}/a.pdf`);
      expect(store.nameOf(store.uriOf('a.pdf'))).toBe('a.pdf');
    });

    it.each([
      ['another directory', 'file:///elsewhere/a.pdf'],
      ['a file in a directory below', 'DIRECTORY/sub/a.pdf'],
      ['a path upwards', 'DIRECTORY/../a.pdf'],
      ['nothing after the root', 'DIRECTORY/'],
      ['a partial file', `DIRECTORY/a.pdf${PARTIAL_SUFFIX}`],
      ['a memory location', 'memory://documents/1/user-1/document-1'],
    ])('does not read a name from %s', (_what, template) => {
      const { store, directory } = aStore();

      expect(store.nameOf(template.replace('DIRECTORY', `file://${directory}`))).toBeUndefined();
    });

    it('can be told to use the locations of its callers instead of the directory', async () => {
      const directory = join(freshDirectory(parent), 'documents');
      const store = nodeFileStore(directory, { rootUri: 'file:///documents/' });
      await store.write('document-1.pdf', bytesOf(1));

      expect(store.uriOf('document-1.pdf')).toBe('file:///documents/document-1.pdf');
      expect(store.nameOf('file:///documents/document-1.pdf')).toBe('document-1.pdf');
      expect(nodeFs.existsSync(join(directory, 'document-1.pdf'))).toBe(true);
    });
  });

  describe('failures', () => {
    it.each(['a/b.pdf', '..', '', '.hidden', 'caf\u00e9.pdf'])(
      'refuses the name %j in every call, and never reaches the volume',
      async (name) => {
        const { store, faulty } = aStore();
        const failure = { ok: false, error: { cause: 'invalid file name' } };

        expect(await store.write(name, bytesOf(1))).toStrictEqual(failure);
        expect(await store.stat(name)).toStrictEqual(failure);
        expect(await store.delete(name)).toStrictEqual(failure);

        expect(faulty.calls).toEqual({
          ensureRoot: 0,
          write: 0,
          move: 0,
          size: 0,
          remove: 0,
          list: 0,
        });
      },
    );

    it('does not write nor look at a file that was being written, but deletes it', async () => {
      const { store, faulty, directory } = aStore();
      const partial = `a.pdf.x1${PARTIAL_SUFFIX}`;
      await store.write('a.pdf', bytesOf(1));
      await faulty.write(partial, bytesOf(2));
      const failure = { ok: false, error: { cause: 'invalid file name' } };

      expect(await store.write(partial, bytesOf(1))).toStrictEqual(failure);
      expect(await store.stat(partial)).toStrictEqual(failure);
      expect((await store.delete(partial)).ok).toBe(true);

      expect(nodeFs.readdirSync(directory)).toEqual(['a.pdf']);
    });

    it('turns a call that fails into a failure whose cause is the code, never a path or a message', async () => {
      const { store, faulty } = aStore();
      faulty.fail('size', true);
      faulty.fail('list', true);
      faulty.fail('remove', true);
      faulty.fail('ensureRoot', true);

      const results = [
        await store.stat('a.pdf'),
        await store.list(),
        await store.delete('a.pdf'),
        await store.write('a.pdf', bytesOf(1)),
        await store.deleteAll(),
      ];

      expect(results).toEqual(results.map(() => ({ ok: false, error: { cause: 'EIO' } })));
    });

    it('gives a failure without a code the cause "unknown failure"', async () => {
      const throwing = createFileStore({
        rootUri: 'file:///x/',
        ensureRoot: () => Promise.reject(new Error('/secret/path')),
        write: () => Promise.reject(new Error('/secret/path')),
        move: () => Promise.reject(new Error('/secret/path')),
        size: () => Promise.reject(new Error('/secret/path')),
        remove: () => Promise.reject(new Error('/secret/path')),
        list: () => Promise.reject(new Error('/secret/path')),
      });

      expect(await throwing.write('a.pdf', bytesOf(1))).toStrictEqual({
        ok: false,
        error: { cause: 'unknown failure' },
      });
    });

    it('settles in bounded time when the file system never answers', async () => {
      const { store, faulty } = aStore();
      faulty.hang('size', true);
      faulty.hang('write', true);

      const stat = await store.stat('a.pdf');
      const write = await store.write('a.pdf', bytesOf(1));

      expect(stat).toStrictEqual({ ok: false, error: { cause: 'timeout' } });
      expect(write).toStrictEqual({ ok: false, error: { cause: 'timeout' } });
    });
  });
});
