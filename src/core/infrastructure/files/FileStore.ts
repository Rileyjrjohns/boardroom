import { err, ok } from '@core/domain/shared/Result';
import type { Result } from '@core/domain/shared/Result';

import { attempt } from '../shared/attempt';

// The seam between what the app keeps in files (the content of the documents already viewed) and
// the file system under it. The adapters are written against `FileStore`: write a file whole or
// not at all, ask whether it is there and how big it is, delete it, delete everything. It is made by
// `createFileStore` from a `FileVolume`, which is what a file system provides: a directory, and a
// handful of raw calls that may reject. Two volumes sit behind it, like the two engines behind
// `SqlConnection`: the one of `expo-file-system` on a device (`ExpoFileVolume`) and the one of
// Node in the tests (`testing/NodeFileVolume.ts`).

/** How long a call may take before it counts as failed. The files are small and local. */
export const DEFAULT_FILE_TIMEOUT_MILLIS = 10_000;

/** What a name is made of: letters, digits, dots, dashes and underscores, and no path. */
const NAME_FORMAT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * The suffix of a file that is being written. A file is written under a name of its own and moved
 * onto its name when it is whole, so a name that ends with this is never a file of the store.
 */
export const PARTIAL_SUFFIX = '.part';

const SEPARATOR = '/';
const INVALID_NAME_CAUSE = 'invalid file name';

/** Whether `name` is made of one segment of safe characters, which is all a name has to be. */
function hasNameFormat(name: string): boolean {
  return NAME_FORMAT.test(name);
}

/** Whether `name` is the name of a file that was being written. */
export function isPartialFileName(name: string): boolean {
  return name.endsWith(PARTIAL_SUFFIX);
}

/** Whether `name` can be the name of a file of the store: one segment, of safe characters, not a partial file. */
export function isValidFileName(name: string): boolean {
  return hasNameFormat(name) && !isPartialFileName(name);
}

/** Why a call on the store failed: a kind of failure, never a path, a name or a message. */
export interface FileStoreFailure {
  readonly cause: string;
}

export interface StoredFile {
  readonly size: number;
}

/**
 * Files in one directory of the app, by name. No call throws or rejects, and every one settles in
 * bounded time. A name is one segment of letters, digits, dots, dashes and underscores (see
 * `isValidFileName`); any other is a failure, so a name that comes from outside can never reach a
 * directory above the store. The names of the files that were being written (`PARTIAL_SUFFIX`) are
 * the store's own: they are listed and can be deleted, so that what a write that was interrupted
 * left can be cleaned up, but they cannot be written or looked at.
 */
export interface FileStore {
  /** Where the file of this name is, as the location the viewer opens. Nothing is read. */
  uriOf(name: string): string;

  /** The name of the file a location points at, or `undefined` when it is not one of this store. */
  nameOf(uri: string): string | undefined;

  /**
   * Writes the file whole or not at all: the bytes go to a file of their own and are moved onto
   * the name only when all of them are written, so a reader never finds half a file, and a failure
   * leaves the previous file, if any, as it was. Writing a name again replaces its file.
   */
  write(name: string, bytes: Uint8Array): Promise<Result<void, FileStoreFailure>>;

  /** `undefined` when there is no such file. */
  stat(name: string): Promise<Result<StoredFile | undefined, FileStoreFailure>>;

  /** Deleting a file that is not there succeeds. A file that was being written can be deleted too. */
  delete(name: string): Promise<Result<void, FileStoreFailure>>;

  /** The names of everything in the store, files that were being written included. */
  list(): Promise<Result<readonly string[], FileStoreFailure>>;

  /**
   * Deletes every file, and goes on after one that cannot be deleted so that it takes as many
   * with it as it can. Fails if any file is left.
   */
  deleteAll(): Promise<Result<void, FileStoreFailure>>;
}

/**
 * What a file system provides, raw: its calls may reject, and nothing is checked. `createFileStore`
 * adds the rest.
 */
export interface FileVolume {
  /** The location of the directory, ending with a slash. */
  readonly rootUri: string;
  /** Makes the directory, and the ones above it, if they are not there. Succeeds if it is. */
  ensureRoot(): Promise<void>;
  /** Writes the bytes to the file, which it creates or empties. */
  write(name: string, bytes: Uint8Array): Promise<void>;
  /** Renames `from` to `to`, replacing the file `to` if there is one. */
  move(from: string, to: string): Promise<void>;
  /** The size of the file, or `undefined` when there is none. */
  size(name: string): Promise<number | undefined>;
  /** Deletes the file. A file that is not there is not an error. */
  remove(name: string): Promise<void>;
  /** The names of the files of the directory. */
  list(): Promise<readonly string[]>;
}

export interface FileStoreOptions {
  /** Defaults to `DEFAULT_FILE_TIMEOUT_MILLIS`. */
  readonly timeoutMillis?: number;
}

/**
 * The store of a volume. All the logic is here, so that the volumes only have to provide the raw
 * calls: the check of the names, the write that is whole or nothing, the failures that are values,
 * and the time that is bounded.
 */
export function createFileStore(volume: FileVolume, options: FileStoreOptions = {}): FileStore {
  const timeout = options.timeoutMillis ?? DEFAULT_FILE_TIMEOUT_MILLIS;
  let partials = 0;
  // Two stores over the same directory (a restart in a test, say) must not name a partial file alike.
  const instance = Math.random().toString(36).slice(2, 10);

  async function run<T>(work: () => Promise<T>): Promise<Result<T, FileStoreFailure>> {
    const done = await attempt(work, timeout);
    return done.ok ? ok(done.value) : err({ cause: done.error.cause });
  }

  /** `work` for a name that is acceptable, or the failure of a name that is not. */
  function runForName<T>(
    acceptable: boolean,
    work: () => Promise<T>,
  ): Promise<Result<T, FileStoreFailure>> {
    if (!acceptable) return Promise.resolve(err({ cause: INVALID_NAME_CAUSE }));
    return run(work);
  }

  return {
    uriOf: (name) => `${volume.rootUri}${name}`,

    nameOf: (uri) => {
      if (!uri.startsWith(volume.rootUri)) return undefined;
      const name = uri.slice(volume.rootUri.length);
      return !name.includes(SEPARATOR) && isValidFileName(name) ? name : undefined;
    },

    write: (name, bytes) =>
      runForName(isValidFileName(name), async () => {
        await volume.ensureRoot();
        partials += 1;
        const partial = `${name}.${instance}${partials}${PARTIAL_SUFFIX}`;
        try {
          await volume.write(partial, bytes);
          await volume.move(partial, name);
        } catch (error) {
          // What is left of a write that failed must not stay: best effort, the failure is the write's.
          await volume.remove(partial).catch(() => undefined);
          throw error;
        }
      }),

    stat: (name) =>
      runForName(isValidFileName(name), async () => {
        const size = await volume.size(name);
        return size === undefined ? undefined : { size };
      }),

    delete: (name) => runForName(hasNameFormat(name), () => volume.remove(name)),

    list: () =>
      run(async () => {
        await volume.ensureRoot();
        return volume.list();
      }),

    deleteAll: () =>
      run(async () => {
        await volume.ensureRoot();
        let firstFailure: unknown;
        let failed = false;
        for (const name of await volume.list()) {
          try {
            await volume.remove(name);
          } catch (error) {
            if (!failed) firstFailure = error;
            failed = true;
          }
        }
        // The first failure as it came: the code it carries is what the failure is reported as.
        if (failed) throw firstFailure;
      }),
  };
}
