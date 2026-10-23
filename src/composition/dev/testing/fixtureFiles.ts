import { FIXTURE_FILE } from '../in-memory/fixtures/loadFixtures';
import type { FixtureFiles } from '../in-memory/fixtures/loadFixtures';

// Test support, not production code: the fixtures of docs/spec/fixtures as they are on disk, parsed
// and unchecked, for the tests that compare what the app reads with what the files say, and that
// break a copy of them on purpose. Only tests and other test support import it. Like
// `NodeFileVolume`, it obtains the modules of Node from the process: the layers' rules know none.

interface NodeFs {
  readFileSync(path: string, encoding: 'utf8'): string;
  readdirSync(path: string): string[];
}
interface NodePath {
  join(...parts: string[]): string;
  resolve(...parts: string[]): string;
}

const nodeFs = (): NodeFs => process.getBuiltinModule('node:fs') as unknown as NodeFs;
const nodePath = (): NodePath => process.getBuiltinModule('node:path') as unknown as NodePath;

/** The folder of the fixtures. */
export const FIXTURES_FOLDER = nodePath().resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'docs',
  'spec',
  'fixtures',
);

/** The names of the JSON files that are in the folder. */
export function fixtureFileNamesOnDisk(): string[] {
  return nodeFs()
    .readdirSync(FIXTURES_FOLDER)
    .filter((name) => name.endsWith('.json'))
    .sort();
}

/** A file of the folder, parsed. */
export function readFixtureFile(name: string): unknown {
  return JSON.parse(
    nodeFs().readFileSync(nodePath().join(FIXTURES_FOLDER, name), 'utf8'),
  ) as unknown;
}

/** All the files, parsed: a new copy at each call, so that a test may change it freely. */
export function readFixtureFiles(): FixtureFiles {
  return {
    accounts: readFixtureFile(FIXTURE_FILE.Accounts),
    meetings: readFixtureFile(FIXTURE_FILE.Meetings),
    recordedVotes: readFixtureFile(FIXTURE_FILE.RecordedVotes),
  };
}

/** The `referenceDate` the files declare, in milliseconds since the epoch. */
export function referenceDateOnDisk(): number {
  const { referenceDate } = readFixtureFile(FIXTURE_FILE.Meetings) as { referenceDate: string };
  return Date.parse(referenceDate);
}
