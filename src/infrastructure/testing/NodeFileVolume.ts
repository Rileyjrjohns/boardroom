import { createFileStore } from '../files/FileStore';
import type { FileStore, FileStoreOptions, FileVolume } from '../files/FileStore';

// Test support, not production code: the file system of the tests, which is the one of Node, so
// that the file store and what is written against it run real file operations in Jest. It stands in
// for `expo-file-system`, which needs a device; the store cannot tell the two apart. Like
// `NodeSqlite`, Node's own modules are obtained from the process: it needs no import of a module
// that the layers' rules would have to know about.

interface NodeFs {
  readFileSync(path: string): Uint8Array;
  mkdirSync(path: string, options: { recursive: boolean }): void;
  writeFileSync(path: string, bytes: Uint8Array): void;
  renameSync(from: string, to: string): void;
  statSync(path: string, options: { throwIfNoEntry: false }): { size: number } | undefined;
  rmSync(path: string, options: { force: boolean }): void;
  readdirSync(path: string): string[];
}
interface NodePath {
  join(...parts: string[]): string;
}

const nodeFs = (): NodeFs => process.getBuiltinModule('node:fs') as unknown as NodeFs;
const nodePath = (): NodePath => process.getBuiltinModule('node:path') as unknown as NodePath;

export interface NodeFileVolumeOptions {
  /**
   * The location the files are said to have, ending with a slash. The files are in the directory,
   * and their locations are made from this, so that a test can use the locations of its fixtures
   * (`file:///documents/`) without writing there. Defaults to the `file://` form of the directory.
   */
  readonly rootUri?: string;
}

/** A directory of the machine as a volume. Its calls are synchronous, wrapped in promises. */
export class NodeFileVolume implements FileVolume {
  readonly rootUri: string;

  constructor(
    private readonly directory: string,
    options: NodeFileVolumeOptions = {},
  ) {
    this.rootUri = options.rootUri ?? `file://${directory}/`;
  }

  ensureRoot(): Promise<void> {
    return this.settle(() => {
      nodeFs().mkdirSync(this.directory, { recursive: true });
    });
  }

  write(name: string, bytes: Uint8Array): Promise<void> {
    return this.settle(() => {
      nodeFs().writeFileSync(this.pathOf(name), bytes);
    });
  }

  move(from: string, to: string): Promise<void> {
    return this.settle(() => {
      nodeFs().renameSync(this.pathOf(from), this.pathOf(to));
    });
  }

  size(name: string): Promise<number | undefined> {
    return this.settle(() => nodeFs().statSync(this.pathOf(name), { throwIfNoEntry: false })?.size);
  }

  remove(name: string): Promise<void> {
    return this.settle(() => {
      nodeFs().rmSync(this.pathOf(name), { force: true });
    });
  }

  list(): Promise<readonly string[]> {
    return this.settle(() => nodeFs().readdirSync(this.directory));
  }

  private pathOf(name: string): string {
    return nodePath().join(this.directory, name);
  }

  private settle<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      // As it came: the code of the failure is what the store reports.
      return Promise.reject(error as Error);
    }
  }
}

/** A file store over a directory of the machine. */
export function nodeFileStore(
  directory: string,
  options: NodeFileVolumeOptions & FileStoreOptions = {},
): FileStore {
  const { rootUri, ...storeOptions } = options;
  return createFileStore(
    new NodeFileVolume(directory, rootUri === undefined ? {} : { rootUri }),
    storeOptions,
  );
}

/** The bytes of the file a `file://` location of a Node store points at, for a test to compare. */
export function readStoredFile(location: string): Uint8Array {
  return nodeFs().readFileSync(location.slice('file://'.length));
}
