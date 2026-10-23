import fs from 'node:fs';
import path from 'node:path';

// The environment is read in one place, the root layout, and every variable it reads is documented
// in .env.example. These checks keep it that way: a second read hidden in a hook, or a variable
// nobody told the next developer about, fails here.

const ROOT = path.resolve(__dirname, '..');
const ROOT_LAYOUT = path.join('app', '_layout.tsx');
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
/** Not global: a global regular expression remembers where it stopped, and skips the next file. */
const ENVIRONMENT_READ = /process\.env\b/;
const ENVIRONMENT_READS = /process\.env\b/g;
const PUBLIC_VARIABLE = /process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g;
/**
 * The variables that are off when empty: .env.example lists them with no value, which is their
 * default. Every other one has a value there.
 */
const OFF_WHEN_EMPTY = new Set(['EXPO_PUBLIC_SENTRY_DSN']);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(path.join(ROOT, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(relative);
    return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [relative] : [];
  });
}

/** The code the app ships: the routes and the layers, not their tests. */
const appCode = [...sourceFiles('app'), ...sourceFiles('src')].filter(
  (file) => !file.split(path.sep).includes('testing'),
);

const read = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');

/** The files, among those given with their source, that read the environment. */
function filesReadingEnvironment(sources: Readonly<Record<string, string>>): string[] {
  return Object.entries(sources)
    .filter(([, source]) => ENVIRONMENT_READ.test(source))
    .map(([file]) => file);
}

describe('the environment', () => {
  it('is read in the root layout and nowhere else', () => {
    const readers = filesReadingEnvironment(
      Object.fromEntries(appCode.map((file) => [file, read(file)])),
    );

    expect(readers).toEqual([ROOT_LAYOUT]);
  });

  it('catches a second read in the file scanned right after the root layout', () => {
    const read = 'const setting = process.env.EXPO_PUBLIC_OTHER;';

    expect(
      filesReadingEnvironment({
        [ROOT_LAYOUT]: read,
        'src/composition/container/zzz.ts': read,
        'src/composition/container/yyy.ts': read,
      }),
    ).toEqual([
      ROOT_LAYOUT,
      'src/composition/container/zzz.ts',
      'src/composition/container/yyy.ts',
    ]);
    expect(
      filesReadingEnvironment({
        [ROOT_LAYOUT]: read,
        'src/composition/container/zzz.ts': 'export const a = 1;',
      }),
    ).toEqual([ROOT_LAYOUT]);
  });

  it('is read once per variable in the root layout, as static expressions Metro can replace', () => {
    const reads = read(ROOT_LAYOUT).match(PUBLIC_VARIABLE) ?? [];

    expect(reads).toEqual([
      'process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS',
      'process.env.EXPO_PUBLIC_BOARDROOM_API_BASE_URL',
      'process.env.EXPO_PUBLIC_SENTRY_DSN',
    ]);
    expect(read(ROOT_LAYOUT).match(ENVIRONMENT_READS)).toHaveLength(3);
  });

  it('has every variable the app reads documented in .env.example, with a default', () => {
    const example = read('.env.example');
    const variables = [...read(ROOT_LAYOUT).matchAll(PUBLIC_VARIABLE)].map(([, name]) => name);

    expect(variables.length).toBeGreaterThan(0);
    for (const name of variables) {
      const value = OFF_WHEN_EMPTY.has(String(name)) ? '\\S*' : '\\S+';
      expect(example).toMatch(new RegExp(`^${name}=${value}$`, 'm'));
    }
  });

  it('has an .env.example that leaves the Sentry address empty, so that monitoring is off by default', () => {
    expect(read('.env.example')).toMatch(/^EXPO_PUBLIC_SENTRY_DSN=$/m);
  });

  it('has an .env.example that is not ignored by git, while .env is', () => {
    const gitignore = read('.gitignore');

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});
