import { err, ok } from '@domain/shared/Result';
import type { Result } from '@domain/shared/Result';

import { OPEN_FAILURE } from '../persistence/DatabaseOpener';
import type { DatabaseOpener, OpenFailure } from '../persistence/DatabaseOpener';
import type { SqlConnection, SqlParams, SqlRow, SqlRunResult } from '../persistence/SqlDatabase';

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
export class NodeSqliteConnection implements SqlConnection {
  private readonly database: NodeDatabase;

  constructor(path: string) {
    const { DatabaseSync } = loadNodeSqlite();
    this.database = new DatabaseSync(path);
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
 * no cipher, so the key is accepted and ignored (see `SimulatedCipherOpener` for a stand-in that
 * enforces it).
 */
export class NodeSqliteOpener implements DatabaseOpener {
  constructor(
    private readonly directory: string,
    private readonly files: FileSystem,
  ) {}

  open(name: string, _key: string): Promise<Result<SqlConnection, OpenFailure>> {
    try {
      return Promise.resolve(ok(new NodeSqliteConnection(this.files.join(this.directory, name))));
    } catch {
      return Promise.resolve(err(OPEN_FAILURE.Failed));
    }
  }

  openScratch(): Promise<SqlConnection> {
    return Promise.resolve(new NodeSqliteConnection(IN_MEMORY_DATABASE));
  }

  delete(name: string): Promise<void> {
    this.files.remove(this.files.join(this.directory, name));
    return Promise.resolve();
  }
}

/** The part of the file system the tests use, from the same place `node:sqlite` comes from. */
export interface FileSystem {
  join(...parts: string[]): string;
  remove(path: string): void;
}

interface NodeFs {
  rmSync(path: string, options: { force: boolean; recursive?: boolean }): void;
  mkdtempSync(prefix: string): string;
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
    remove: (target) => {
      // Companions of a database (its journal) go with it.
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        fs.rmSync(`${target}${suffix}`, { force: true });
      }
    },
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
