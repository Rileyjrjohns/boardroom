import { Directory, File, Paths } from 'expo-file-system';

import type { FileVolume } from './FileStore';

/**
 * Where on the device the directory of the store lives. Both are private to the app and out of the
 * backups; they differ in what the system may do to them.
 *
 * - `Cache`: the caches directory. The system may empty it when the device runs low on storage, so
 *   a file can be gone without the app having deleted it, which the document cache reads as a
 *   miss. On iOS this is the right place: the documents folder is part of the iCloud and iTunes
 *   backups, and keeping a file out of them needs a call this module does not offer.
 * - `Private`: the private storage of the app (the files directory on Android). The system leaves
 *   it alone, and Android's backups are off for the app (`android.allowBackup` is `false`), so
 *   nothing leaves the device from it.
 */
export const EXPO_STORAGE = {
  Cache: 'cache',
  Private: 'private',
} as const;

export type ExpoStorage = (typeof EXPO_STORAGE)[keyof typeof EXPO_STORAGE];

const TRAILING_SLASH = '/';

/**
 * The volume of a device, over `expo-file-system`: as thin as it can be. It renames the calls of
 * the module to those of `FileVolume`, and it is the one file that imports the module (a lint rule
 * keeps it so). Its logic is none (the whole-or-nothing write, the names, the time limits and the
 * failures that are values are in `createFileStore`), so Jest only checks what it asks of the
 * module, and the module itself has been run on no device.
 *
 * The module's calls are synchronous; they are wrapped in promises, and a call that throws is a
 * promise that rejects.
 */
export class ExpoFileVolume implements FileVolume {
  readonly rootUri: string;
  private readonly root: Directory;

  constructor(storage: ExpoStorage, directoryName: string) {
    this.root = new Directory(
      storage === EXPO_STORAGE.Cache ? Paths.cache : Paths.document,
      directoryName,
    );
    this.rootUri = this.root.uri.endsWith(TRAILING_SLASH)
      ? this.root.uri
      : `${this.root.uri}${TRAILING_SLASH}`;
  }

  ensureRoot(): Promise<void> {
    return this.settle(() => {
      this.root.create({ intermediates: true, idempotent: true });
    });
  }

  write(name: string, bytes: Uint8Array): Promise<void> {
    return this.settle(() => {
      const file = new File(this.root, name);
      file.create({ overwrite: true });
      file.write(bytes);
    });
  }

  async move(from: string, to: string): Promise<void> {
    await new File(this.root, from).move(new File(this.root, to), { overwrite: true });
  }

  size(name: string): Promise<number | undefined> {
    return this.settle(() => {
      const file = new File(this.root, name);
      return file.exists ? file.size : undefined;
    });
  }

  remove(name: string): Promise<void> {
    return this.settle(() => {
      const file = new File(this.root, name);
      if (file.exists) file.delete();
    });
  }

  list(): Promise<readonly string[]> {
    return this.settle(() =>
      this.root
        .list()
        .filter((entry): entry is File => entry instanceof File)
        .map((file) => file.name),
    );
  }

  private settle<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }
}
