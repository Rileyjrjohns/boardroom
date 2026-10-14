import type { FileVolume } from '../files/FileStore';

// Test support, not production code: a volume that fails when the test says so, to check that the
// store and the adapters over it turn a file system that fails into the errors of their ports and
// leave the files as they were.

/** The calls of a volume that can be made to fail. */
export type VolumeCall = 'ensureRoot' | 'write' | 'move' | 'size' | 'remove' | 'list';

export class FaultyFileVolume implements FileVolume {
  private readonly failing = new Set<VolumeCall>();
  private readonly hanging = new Set<VolumeCall>();

  /** How many times each call was made, failed ones included. */
  readonly calls: Record<VolumeCall, number> = {
    ensureRoot: 0,
    write: 0,
    move: 0,
    size: 0,
    remove: 0,
    list: 0,
  };

  constructor(private readonly inner: FileVolume) {}

  get rootUri(): string {
    return this.inner.rootUri;
  }

  /** While set, the call rejects with an error that carries a code, as the file system's do. */
  fail(call: VolumeCall, failing: boolean): void {
    if (failing) this.failing.add(call);
    else this.failing.delete(call);
  }

  /** While set, the call never answers. */
  hang(call: VolumeCall, hanging: boolean): void {
    if (hanging) this.hanging.add(call);
    else this.hanging.delete(call);
  }

  ensureRoot(): Promise<void> {
    return this.guard('ensureRoot', () => this.inner.ensureRoot());
  }

  write(name: string, bytes: Uint8Array): Promise<void> {
    return this.guard('write', () => this.inner.write(name, bytes));
  }

  move(from: string, to: string): Promise<void> {
    return this.guard('move', () => this.inner.move(from, to));
  }

  size(name: string): Promise<number | undefined> {
    return this.guard('size', () => this.inner.size(name));
  }

  remove(name: string): Promise<void> {
    return this.guard('remove', () => this.inner.remove(name));
  }

  list(): Promise<readonly string[]> {
    return this.guard('list', () => this.inner.list());
  }

  private guard<T>(call: VolumeCall, send: () => Promise<T>): Promise<T> {
    this.calls[call] += 1;
    if (this.hanging.has(call)) return new Promise<T>(() => undefined);
    if (this.failing.has(call)) {
      return Promise.reject(Object.assign(new Error(`${call} failed`), { code: 'EIO' }));
    }
    return send();
  }
}
