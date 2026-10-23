import { Platform } from 'react-native';

import { fakeExpoFileSystem, resetFakeExpoFileSystem } from '../testing/fakeExpoFileSystem';

import { DOCUMENT_DIRECTORY_NAME, createExpoFileStore } from './createExpoFileStore';
import { EXPO_STORAGE, ExpoFileVolume } from './ExpoFileVolume';
import { createFileStore } from './FileStore';

// The native side of expo-file-system cannot run in Jest, so the module is replaced by a stand-in
// that keeps the files in memory and answers like the module does to the calls the wrapper makes
// (src/core/infrastructure/testing/fakeExpoFileSystem.ts). The wrapper decides nothing: what is left to
// check is the conversation with the module, and that the store works over it.
jest.mock('expo-file-system', () => jest.requireActual('../testing/fakeExpoFileSystem'));

const CACHE = 'file:///mock/cache/boardroom-documents/';
const PRIVATE = 'file:///mock/document/boardroom-documents/';

const bytes = (...values: number[]): Uint8Array => Uint8Array.from(values);

beforeEach(() => {
  resetFakeExpoFileSystem();
  Platform.OS = 'ios';
});

describe('ExpoFileVolume', () => {
  describe('where it is', () => {
    it('is a directory of the caches of the app for the caches storage', () => {
      expect(new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME).rootUri).toBe(CACHE);
    });

    it('is a directory of the private storage of the app for the private storage', () => {
      expect(new ExpoFileVolume(EXPO_STORAGE.Private, DOCUMENT_DIRECTORY_NAME).rootUri).toBe(
        PRIVATE,
      );
    });

    it('says its location with a slash at the end, whether or not the module does', () => {
      fakeExpoFileSystem.directoryUriEndsWithSlash = false;

      expect(new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME).rootUri).toBe(CACHE);
    });
  });

  describe('the calls it makes', () => {
    it('makes its directory, and the ones above it, and makes it again without failing', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);

      await volume.ensureRoot();
      await volume.ensureRoot();

      expect(fakeExpoFileSystem.directories.has(CACHE)).toBe(true);
    });

    it('writes a file by creating it, over what is there, and writing the bytes', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);
      await volume.ensureRoot();
      fakeExpoFileSystem.calls.length = 0;

      await volume.write('a.pdf', bytes(1, 2, 3));
      await volume.write('a.pdf', bytes(9));

      expect(fakeExpoFileSystem.calls).toEqual([
        'File.create(overwrite)',
        'File.write',
        'File.create(overwrite)',
        'File.write',
      ]);
      expect(Array.from(fakeExpoFileSystem.files.get(`${CACHE}a.pdf`) ?? [])).toEqual([9]);
    });

    it('moves a file onto another, over it', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);
      await volume.ensureRoot();
      await volume.write('a.pdf', bytes(1));
      await volume.write('b.pdf.part', bytes(2));

      await volume.move('b.pdf.part', 'a.pdf');

      expect([...fakeExpoFileSystem.files.keys()]).toEqual([`${CACHE}a.pdf`]);
      expect(Array.from(fakeExpoFileSystem.files.get(`${CACHE}a.pdf`) ?? [])).toEqual([2]);
    });

    it('says the size of a file, and nothing for a file that is not there', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);
      await volume.ensureRoot();
      await volume.write('a.pdf', bytes(1, 2, 3));

      expect(await volume.size('a.pdf')).toBe(3);
      expect(await volume.size('missing.pdf')).toBeUndefined();
    });

    it('deletes a file, and a file that is not there is not an error', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);
      await volume.ensureRoot();
      await volume.write('a.pdf', bytes(1));

      await volume.remove('a.pdf');
      await volume.remove('a.pdf');

      expect(fakeExpoFileSystem.files.size).toBe(0);
    });

    it('lists the names of the files, and leaves the directories out', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);
      await volume.ensureRoot();
      await volume.write('a.pdf', bytes(1));
      await volume.write('b.pdf', bytes(1));
      fakeExpoFileSystem.directories.add(`${CACHE}sub/`);

      expect([...(await volume.list())].sort()).toEqual(['a.pdf', 'b.pdf']);
    });

    it('lets what the module says go, as a rejection and never as an exception', async () => {
      const volume = new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME);

      // The directory was never made: the module refuses to list it and to create a file in it.
      await expect(volume.list()).rejects.toMatchObject({ code: 'ERR_NO_DIRECTORY' });
      await expect(volume.write('a.pdf', bytes(1))).rejects.toMatchObject({
        code: 'ERR_NO_PARENT',
      });
      await expect(volume.move('a.pdf', 'b.pdf')).rejects.toMatchObject({ code: 'ERR_NO_FILE' });
    });
  });

  describe('under the store', () => {
    it('keeps a file whole or not at all, and lists, looks at and deletes it', async () => {
      const store = createFileStore(
        new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME),
      );

      expect((await store.write('a.pdf', bytes(1, 2, 3))).ok).toBe(true);
      expect(await store.stat('a.pdf')).toEqual({ ok: true, value: { size: 3 } });
      expect(await store.list()).toEqual({ ok: true, value: ['a.pdf'] });
      expect(store.nameOf(store.uriOf('a.pdf'))).toBe('a.pdf');
      expect(store.uriOf('a.pdf')).toBe(`${CACHE}a.pdf`);
      expect((await store.deleteAll()).ok).toBe(true);
      expect(await store.list()).toEqual({ ok: true, value: [] });
    });

    it('leaves no partial file when the move fails', async () => {
      const store = createFileStore(
        new ExpoFileVolume(EXPO_STORAGE.Cache, DOCUMENT_DIRECTORY_NAME),
      );
      await store.write('a.pdf', bytes(1));
      const { File } = jest.requireActual<typeof import('../testing/fakeExpoFileSystem')>(
        '../testing/fakeExpoFileSystem',
      );
      const move = File.prototype.move;
      File.prototype.move = () => Promise.reject(Object.assign(new Error('x'), { code: 'EIO' }));

      const failed = await store.write('a.pdf', bytes(9, 9));
      File.prototype.move = move;

      expect(failed).toEqual({ ok: false, error: { cause: 'EIO' } });
      expect(await store.list()).toEqual({ ok: true, value: ['a.pdf'] });
    });
  });
});

describe('createExpoFileStore', () => {
  it('keeps the documents in the caches directory on iOS', async () => {
    Platform.OS = 'ios';
    const store = createExpoFileStore();

    expect(store.uriOf('a.pdf')).toBe(`${CACHE}a.pdf`);
  });

  it('keeps the documents in the private storage of the app on Android', async () => {
    Platform.OS = 'android';
    const store = createExpoFileStore();

    expect(store.uriOf('a.pdf')).toBe(`${PRIVATE}a.pdf`);
  });
});
