import type { DatabaseOpener, EngineConnection } from '../persistence/DatabaseOpener';
import type { SqlParams, SqlRow, SqlRunResult } from '../persistence/SqlDatabase';

// Test support, not production code: the SQLite engine of the tests, which is the one that comes
// with Node (`node:sqlite`), so the adapters run real SQL in Jest. It stands in for `expo-sqlite`,
// which needs a device; the adapters and the migrations cannot tell the two apart.

// Jest cannot resolve `node:sqlite` (its list of Node modules predates it), so the module is
// obtained from the process instead of being imported. It needs no dependency and is the same
// module. The types below are the part of it that is used.
interface NodeStatement {
  run(...params: (string | number | null)[]): { changes: number | bigint };
  all(...params: (string | number | null)[]): Record<string, string | number | null>[];
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

interface NodeSqliteModule {
  readonly DatabaseSync: new (path: string) => NodeDatabase;
}

function loadNodeSqlite(): NodeSqliteModule {
  const sqlite: unknown = process.getBuiltinModule('node:sqlite');
  return sqlite as NodeSqliteModule;
}

export const IN_MEMORY_DATABASE = ':memory:';

/** A connection to a database of `node:sqlite`. Its calls are synchronous, wrapped in promises. */
export class NodeSqliteConnection implements EngineConnection {
  private readonly database: NodeDatabase;

  constructor(path: string) {
    const { DatabaseSync } = loadNodeSqlite();
    this.database = new DatabaseSync(path);
  }

  exec(sql: string): Promise<void> {
    return this.settle(() => {
      this.database.exec(sql);
    });
  }

  run(sql: string, params: SqlParams): Promise<SqlRunResult> {
    return this.settle(() => ({
      changes: Number(this.database.prepare(sql).run(...params).changes),
    }));
  }

  all(sql: string, params: SqlParams): Promise<readonly SqlRow[]> {
    return this.settle(() => this.database.prepare(sql).all(...params));
  }

  close(): Promise<void> {
    return this.settle(() => {
      this.database.close();
    });
  }

  private settle<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      // As it came: the code of the failure is what the adapters report.
      return Promise.reject(error as Error);
    }
  }
}

/**
 * Opens the files of `node:sqlite` in a directory. The files are not encrypted: Node's SQLite has
 * no cipher, so a key is accepted and ignored (see `SimulatedCipherOpener` for a stand-in that
 * enforces it). Like the seam it stands for, it removes the main file of a database and nothing
 * beside it, and removing a file that is not there succeeds.
 */
export class NodeSqliteOpener implements DatabaseOpener {
  constructor(
    private readonly directory: string,
    private readonly files: FileSystem,
  ) {}

  open(name: string): Promise<EngineConnection> {
    try {
      return Promise.resolve(new NodeSqliteConnection(this.files.join(this.directory, name)));
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }

  remove(name: string): Promise<void> {
    this.files.remove(this.files.join(this.directory, name));
    return Promise.resolve();
  }

  /** Whether the file of a database is there, to see what a reset left behind. */
  exists(name: string): boolean {
    return this.files.exists(this.files.join(this.directory, name));
  }
}

/** The part of the file system the tests use, from the same place `node:sqlite` comes from. */
export interface FileSystem {
  join(...parts: string[]): string;
  /** Removes the file. A file that is not there is not an error. */
  remove(path: string): void;
  exists(path: string): boolean;
}

interface NodeFs {
  rmSync(path: string, options: { force: boolean; recursive?: boolean }): void;
  mkdtempSync(prefix: string): string;
  existsSync(path: string): boolean;
}
interface NodePath {
  join(...parts: string[]): string;
}
interface NodeOs {
  tmpdir(): string;
}

export function nodeFileSystem(): FileSystem {
  const fs = process.getBuiltinModule('node:fs') as unknown as NodeFs;
  const path = process.getBuiltinModule('node:path') as unknown as NodePath;
  return {
    join: (...parts) => path.join(...parts),
    // The main file only, like `deleteDatabaseAsync` of the module.
    remove: (target) => {
      fs.rmSync(target, { force: true });
    },
    exists: (target) => fs.existsSync(target),
  };
}

/**
 * A new directory inside `parent`, for the files of one device of a test. It goes when `parent`
 * does (see `temporaryDirectory`).
 */
export function freshDirectory(parent: string): string {
  const fs = process.getBuiltinModule('node:fs') as unknown as NodeFs;
  const path = process.getBuiltinModule('node:path') as unknown as NodePath;
  return fs.mkdtempSync(path.join(parent, 'device-'));
}

/**
 * A directory of its own for the databases of a test file, removed when the file is done. Call it
 * at the top of the file.
 */
export function temporaryDirectory(): string {
  const fs = process.getBuiltinModule('node:fs') as unknown as NodeFs;
  const os = process.getBuiltinModule('node:os') as unknown as NodeOs;
  const path = process.getBuiltinModule('node:path') as unknown as NodePath;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'boardroom-test-'));
  afterAll(() => {
    fs.rmSync(directory, { force: true, recursive: true });
  });
  return directory;
}
