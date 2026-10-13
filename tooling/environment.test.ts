import fs from 'node:fs';
import path from 'node:path';

// The environment is read in one place, the root layout, and every variable it reads is documented
// in .env.example. These checks keep it that way: a second read hidden in a hook, or a variable
// nobody told the next developer about, fails here.

const ROOT = path.resolve(__dirname, '..');
const ROOT_LAYOUT = path.join('app', '_layout.tsx');
const SOURCE_FILE = /\.(ts|tsx)$/;
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const ENVIRONMENT_READ = /process\.env\b/g;
const PUBLIC_VARIABLE = /process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g;

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

describe('the environment', () => {
  it('is read in the root layout and nowhere else', () => {
    const readers = appCode.filter((file) => ENVIRONMENT_READ.test(read(file)));
    ENVIRONMENT_READ.lastIndex = 0;

    expect(readers).toEqual([ROOT_LAYOUT]);
  });

  it('is read once in the root layout, as a static expression Metro can replace', () => {
    const reads = read(ROOT_LAYOUT).match(PUBLIC_VARIABLE) ?? [];

    expect(reads).toEqual(['process.env.EXPO_PUBLIC_BOARDROOM_ADAPTERS']);
    expect(read(ROOT_LAYOUT).match(ENVIRONMENT_READ)).toHaveLength(1);
  });

  it('has every variable the app reads documented in .env.example, with a default', () => {
    const example = read('.env.example');
    const variables = [...read(ROOT_LAYOUT).matchAll(PUBLIC_VARIABLE)].map(([, name]) => name);

    expect(variables.length).toBeGreaterThan(0);
    for (const name of variables) {
      expect(example).toMatch(new RegExp(`^${name}=\\S+$`, 'm'));
    }
  });

  it('has an .env.example that is not ignored by git, while .env is', () => {
    const gitignore = read('.gitignore');

    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});
