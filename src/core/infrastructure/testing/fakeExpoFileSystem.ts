// Test support, not production code: a stand-in for the native side of `expo-file-system`, for the
// test of the thin wrapper over it (`ExpoFileVolume`). It keeps files and directories in memory and
// behaves like the module in the ways the wrapper depends on (SDK 57, the class based API): a file
// can only be created in a directory that exists, `create` refuses a file that is there unless it is
// told to overwrite, `delete` refuses one that is not, `move` onto a file that is there needs
// `overwrite`, and `uri` of a directory ends with a slash.

const CACHE_URI = 'file:///mock/cache/';
const DOCUMENT_URI = 'file:///mock/document/';

export const fakeExpoFileSystem = {
  /** The files, by uri. */
  files: new Map<string, Uint8Array>(),
  /** The directories, by uri (with the slash). */
  directories: new Set<string>([CACHE_URI, DOCUMENT_URI]),
  /** Every call, as `Class.method`, in order. */
  calls: [] as string[],
  /** Whether the uri of a directory ends with a slash, as the module's does. */
  directoryUriEndsWithSlash: true,
};

export function resetFakeExpoFileSystem(): void {
  fakeExpoFileSystem.files.clear();
  fakeExpoFileSystem.directories.clear();
  fakeExpoFileSystem.directories.add(CACHE_URI);
  fakeExpoFileSystem.directories.add(DOCUMENT_URI);
  fakeExpoFileSystem.calls.length = 0;
  fakeExpoFileSystem.directoryUriEndsWithSlash = true;
}

const withSlash = (uri: string): string => (uri.endsWith('/') ? uri : `${uri}/`);
const withoutSlash = (uri: string): string => (uri.endsWith('/') ? uri.slice(0, -1) : uri);
const parentOf = (uri: string): string => withSlash(withoutSlash(uri).replace(/[^/]*$/, ''));
const nameOf = (uri: string): string => withoutSlash(uri).split('/').pop() ?? '';

/** The uri the parts make: the first is a uri or a directory, the others are names. */
function joinUri(parts: readonly (string | { readonly uri: string })[]): string {
  const [first, ...names] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
  return names.reduce((base, name) => `${withSlash(base)}${name}`, first ?? '');
}

function record(call: string): void {
  fakeExpoFileSystem.calls.push(call);
}

export class Directory {
  private readonly key: string;

  constructor(...parts: (string | { readonly uri: string })[]) {
    this.key = withSlash(joinUri(parts));
  }

  get uri(): string {
    return fakeExpoFileSystem.directoryUriEndsWithSlash ? this.key : withoutSlash(this.key);
  }

  get exists(): boolean {
    return fakeExpoFileSystem.directories.has(this.key);
  }

  get name(): string {
    return nameOf(this.key);
  }

  create(options: { intermediates?: boolean; idempotent?: boolean } = {}): void {
    record('Directory.create');
    if (this.exists) {
      if (options.idempotent === true) return;
      throw Object.assign(new Error('The directory exists.'), { code: 'ERR_DIRECTORY_EXISTS' });
    }
    if (!fakeExpoFileSystem.directories.has(parentOf(this.key)) && options.intermediates !== true) {
      throw Object.assign(new Error('The parent does not exist.'), { code: 'ERR_NO_PARENT' });
    }
    fakeExpoFileSystem.directories.add(this.key);
  }

  list(): (Directory | File)[] {
    record('Directory.list');
    if (!this.exists) {
      throw Object.assign(new Error('The directory does not exist.'), { code: 'ERR_NO_DIRECTORY' });
    }
    const files = [...fakeExpoFileSystem.files.keys()]
      .filter((uri) => parentOf(uri) === this.key)
      .map((uri) => new File(uri));
    const directories = [...fakeExpoFileSystem.directories]
      .filter((uri) => uri !== this.key && parentOf(uri) === this.key)
      .map((uri) => new Directory(uri));
    return [...directories, ...files];
  }
}

export class File {
  private key: string;

  constructor(...parts: (string | { readonly uri: string })[]) {
    this.key = joinUri(parts);
  }

  get uri(): string {
    return this.key;
  }

  get name(): string {
    return nameOf(this.key);
  }

  get exists(): boolean {
    return fakeExpoFileSystem.files.has(this.key);
  }

  get size(): number {
    return fakeExpoFileSystem.files.get(this.key)?.byteLength ?? 0;
  }

  create(options: { overwrite?: boolean } = {}): void {
    record(`File.create${options.overwrite === true ? '(overwrite)' : ''}`);
    if (!fakeExpoFileSystem.directories.has(parentOf(this.key))) {
      throw Object.assign(new Error('The parent does not exist.'), { code: 'ERR_NO_PARENT' });
    }
    if (this.exists && options.overwrite !== true) {
      throw Object.assign(new Error('The file exists.'), { code: 'ERR_FILE_EXISTS' });
    }
    fakeExpoFileSystem.files.set(this.key, new Uint8Array(0));
  }

  write(content: string | Uint8Array): void {
    record('File.write');
    if (!fakeExpoFileSystem.directories.has(parentOf(this.key))) {
      throw Object.assign(new Error('The parent does not exist.'), { code: 'ERR_NO_PARENT' });
    }
    if (typeof content === 'string') throw new Error('The stand-in writes bytes only.');
    fakeExpoFileSystem.files.set(this.key, Uint8Array.from(content));
  }

  delete(): void {
    record('File.delete');
    if (!this.exists) {
      throw Object.assign(new Error('The file does not exist.'), { code: 'ERR_NO_FILE' });
    }
    fakeExpoFileSystem.files.delete(this.key);
  }

  move(destination: File, options: { overwrite?: boolean } = {}): Promise<void> {
    record(`File.move${options.overwrite === true ? '(overwrite)' : ''}`);
    const bytes = fakeExpoFileSystem.files.get(this.key);
    if (bytes === undefined) {
      return Promise.reject(
        Object.assign(new Error('The file does not exist.'), { code: 'ERR_NO_FILE' }),
      );
    }
    if (destination.exists && options.overwrite !== true) {
      return Promise.reject(
        Object.assign(new Error('The destination exists.'), { code: 'ERR_FILE_EXISTS' }),
      );
    }
    fakeExpoFileSystem.files.delete(this.key);
    fakeExpoFileSystem.files.set(destination.uri, bytes);
    this.key = destination.uri;
    return Promise.resolve();
  }
}

export const Paths = {
  get cache(): Directory {
    return new Directory(CACHE_URI);
  },
  get document(): Directory {
    return new Directory(DOCUMENT_URI);
  },
};
