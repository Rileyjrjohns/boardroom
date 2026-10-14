import fs from 'node:fs';
import path from 'node:path';

// Checks of the repository configuration itself: the path aliases that TypeScript, Metro, ESLint
// and Jest share, and the placement of the test files. They guard against a configuration that
// silently stops doing its job, for example a test that no Jest project would ever run.

const ROOT = path.resolve(__dirname, '..');

interface JestProject {
  displayName: string;
  roots: string[];
  moduleNameMapper: Record<string, string>;
}

const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8')) as {
  compilerOptions: { paths: Record<string, string[]> };
};
const jestConfig = jest.requireActual<{ projects: JestProject[] }>('../jest.config.js');

const aliasPaths = tsconfig.compilerOptions.paths;
const layers = fs
  .readdirSync(path.join(ROOT, 'src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe('path aliases', () => {
  it('has one alias in tsconfig.json for each folder of src', () => {
    expect(Object.keys(aliasPaths).sort()).toEqual(layers.map((layer) => `@${layer}/*`));
  });

  it.each(layers)('maps @%s/* to the src/%s folder', (layer) => {
    expect(aliasPaths[`@${layer}/*`]).toEqual([`./src/${layer}/*`]);
    expect(fs.statSync(path.join(ROOT, 'src', layer)).isDirectory()).toBe(true);
  });

  describe.each(jestConfig.projects.map((project) => [project.displayName, project] as const))(
    'Jest project %s',
    (_name, project) => {
      it.each(layers)('resolves @%s/* like tsconfig.json does', (layer) => {
        const specifier = `@${layer}/some/File`;
        const matching = Object.entries(project.moduleNameMapper).filter(([pattern]) =>
          new RegExp(pattern).test(specifier),
        );

        expect(matching).toHaveLength(1);
        const [[pattern, target]] = matching as [[string, string]];
        expect(specifier.replace(new RegExp(pattern), target)).toBe(
          `<rootDir>/src/${layer}/some/File`,
        );
      });
    },
  );
});

const IGNORED_FOLDERS = new Set([
  '.expo',
  '.git',
  'android',
  'coverage',
  'dist',
  'ios',
  'node_modules',
]);
const TEST_FILE_NAME = /\.(test|spec)\.[cm]?[jt]sx?$/;
const COLLECTED_TEST_FILE_NAME = /\.(test|spec)\.tsx?$/;

function findTestFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return IGNORED_FOLDERS.has(entry.name) ? [] : findTestFiles(absolute);
    return TEST_FILE_NAME.test(entry.name) ? [path.relative(ROOT, absolute)] : [];
  });
}

describe('test file placement', () => {
  const roots = jestConfig.projects.flatMap((project) =>
    project.roots.map((root) => root.replace('<rootDir>/', '')),
  );
  const testFiles = findTestFiles(ROOT);

  it('finds the test files of the repository', () => {
    expect(testFiles).toContain(path.join('tooling', 'repository.test.ts'));
  });

  it('has no test file under app/, where expo-router would treat it as a route', () => {
    expect(testFiles.filter((file) => file.startsWith(`app${path.sep}`))).toEqual([]);
  });

  it('has no test file that no Jest project would run', () => {
    const orphans = testFiles.filter(
      (file) =>
        !COLLECTED_TEST_FILE_NAME.test(file) ||
        !roots.some((root) => file.startsWith(`${root}${path.sep}`)),
    );

    expect(orphans).toEqual([]);
  });
});

// A no-break space typed as itself cannot be told from a space in an editor, a diff or a review, and
// the French of the app depends on it before every colon, semicolon, question mark and exclamation
// mark. It is always written as the escape `\u00a0`, in the resources and in the tests that quote
// them, so that a reader sees it and a search finds it.
const SOURCE_FOLDERS = ['src', 'app', 'tooling'];
const SOURCE_FILE_NAME = /\.[cm]?[jt]sx?$/;
const NO_BREAK_SPACE = '\u00a0';

function findSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory())
      return IGNORED_FOLDERS.has(entry.name) ? [] : findSourceFiles(absolute);
    return SOURCE_FILE_NAME.test(entry.name) ? [absolute] : [];
  });
}

describe('the no-break space', () => {
  it('is never typed as itself in a source file: it is written \\u00a0', () => {
    const typedAsItself = SOURCE_FOLDERS.flatMap((folder) =>
      findSourceFiles(path.join(ROOT, folder)),
    )
      .filter((file) => fs.readFileSync(file, 'utf8').includes(NO_BREAK_SPACE))
      .map((file) => path.relative(ROOT, file));

    expect(typedAsItself).toEqual([]);
  });
});
