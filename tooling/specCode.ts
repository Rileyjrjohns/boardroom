import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

// What the conformance test reads from the code: the constants that are exported (imported, so the
// values are the real ones), the use case classes (imported), the interfaces of the ports (read as
// TypeScript source, because an interface has no value at runtime), the files under app/.

export const ROOT = path.resolve(__dirname, '..');

const SOURCE_FILE = /\.tsx?$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const DECLARATION_FILE = /\.d\.ts$/;
/** The folders of test support: fakes, builders, contract suites. They are not part of the contract. */
const TEST_SUPPORT_FOLDER = 'testing';
const CONSTANT_NAME = /^[A-Z][A-Z0-9_]*$/;

/** The source files under a folder (relative to the root), tests and test support left out. */
export function sourceFilesUnder(folder: string): string[] {
  return fs
    .readdirSync(path.join(ROOT, folder), { recursive: true, encoding: 'utf8' })
    .filter(
      (file) =>
        SOURCE_FILE.test(file) &&
        !TEST_FILE.test(file) &&
        !DECLARATION_FILE.test(file) &&
        !file.split(path.sep).includes(TEST_SUPPORT_FOLDER),
    )
    .sort()
    .map((file) => path.join(ROOT, folder, file));
}

/** The module at a path, loaded as the code itself would load it. */
export function loadModule(file: string): Record<string, unknown> {
  return jest.requireActual<Record<string, unknown>>(file);
}

export interface Enumeration {
  /** The name of the constant, as exported. */
  readonly name: string;
  readonly file: string;
  /** The values of the constant: stable strings. */
  readonly values: readonly string[];
}

/**
 * The stable strings a constant holds, when it is only that: a const object of strings, a list of
 * strings or a set of strings. Anything else is not an enumeration.
 */
function stableStringsOf(value: unknown): string[] | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const members: unknown[] =
    value instanceof Set ? [...value] : Array.isArray(value) ? value : Object.values(value);
  return isNonEmptyStrings(members) ? members : undefined;
}

function isNonEmptyStrings(members: readonly unknown[]): members is string[] {
  return members.length > 0 && members.every((member) => typeof member === 'string');
}

/**
 * The exported constants of the files that hold stable strings, named in upper case: a const
 * object of strings (`VOTE_CHOICE`, `VOTING_ERROR_CODE`), a list or a set of them
 * (`SESSION_ENDING_CODES`). Anything else the files export (functions, numbers, types, a const
 * object of other things) is not an enumeration.
 */
export function enumerationsIn(files: readonly string[]): Enumeration[] {
  return files.flatMap((file) =>
    Object.entries(loadModule(file)).flatMap(([name, value]) => {
      const values = stableStringsOf(value);
      return CONSTANT_NAME.test(name) && values !== undefined
        ? [{ name, file: path.relative(ROOT, file), values }]
        : [];
    }),
  );
}

/** The exported constants of the files that are a number, named in upper case, by name. */
export function numericConstantsIn(files: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    files.flatMap((file) =>
      Object.entries(loadModule(file)).flatMap(([name, value]) =>
        CONSTANT_NAME.test(name) && typeof value === 'number' ? [[name, value] as const] : [],
      ),
    ),
  );
}

function hasExecuteMethod(value: unknown): boolean {
  if (typeof value !== 'function') return false;
  const prototype: unknown = value.prototype;
  return (
    typeof prototype === 'object' &&
    prototype !== null &&
    'execute' in prototype &&
    typeof prototype.execute === 'function'
  );
}

/** The names of the classes that have an `execute` method, exported by the files. */
export function useCaseNamesIn(files: readonly string[]): string[] {
  return files
    .flatMap((file) => Object.entries(loadModule(file)))
    .filter(([, value]) => hasExecuteMethod(value))
    .map(([name]) => name)
    .sort();
}

export interface PortInterface {
  readonly name: string;
  readonly operations: readonly { readonly name: string; readonly parameters: readonly string[] }[];
}

/**
 * The ports in the files: the exported interfaces that declare at least one method. The data-only
 * interfaces of the folder (a cache entry, a key, an event) are not ports.
 */
export function portsIn(files: readonly string[]): PortInterface[] {
  return files.flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    return source.statements.flatMap((statement) => {
      if (!ts.isInterfaceDeclaration(statement)) return [];
      const exported = ts
        .getModifiers(statement)
        ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
      const operations = statement.members.filter(ts.isMethodSignature).map((method) => ({
        name: method.name.getText(source),
        parameters: method.parameters.map((parameter) => parameter.name.getText(source)),
      }));
      return exported === true && operations.length > 0
        ? [{ name: statement.name.text, operations }]
        : [];
    });
  });
}

const ROUTE_FILE = /\.tsx$/;
/** The files of app/ that are not screens: the layout and the file that rewrites system links. */
const NOT_A_ROUTE = new Set(['_layout', '+native-intent']);

/** The route of every screen file under app/: `index.tsx` is `/`, `meetings/[meetingId].tsx` is `/meetings/[meetingId]`. */
export function routesOfApp(): string[] {
  return fs
    .readdirSync(path.join(ROOT, 'app'), { recursive: true, encoding: 'utf8' })
    .filter((file) => ROUTE_FILE.test(file))
    .map((file) => file.slice(0, -'.tsx'.length).split(path.sep).join('/'))
    .filter((route) => !NOT_A_ROUTE.has(route))
    .map((route) => (route === 'index' ? '/' : `/${route}`))
    .sort();
}

/** The dynamic segments of a route: the names inside the brackets. */
export function parametersOfRoute(route: string): string[] {
  return [...route.matchAll(/\[([^\]]+)\]/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}
