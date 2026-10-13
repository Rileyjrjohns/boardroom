// Jest configuration, split in four projects. Every test file must be named `*.test.ts(x)` or
// `*.spec.ts(x)` and live under the root of one of them, otherwise nothing runs it (the
// "tooling" project checks this):
//
// - "core"    : src/domain and src/application, in a plain node environment with no React Native
//               or Expo setup at all. If either layer ever reaches for a framework API, its tests
//               fail here, which keeps both layers framework free.
// - "infra"   : src/infrastructure and src/di, on the jest-expo preset, which mocks the native
//               side of the Expo modules the adapters rely on.
// - "ui"      : src/presentation, on the jest-expo preset with React Native Testing Library.
// - "tooling" : tooling/, in a plain node environment. Checks of the repository configuration.
//
// Never put test files under app/: expo-router would treat them as routes.

const fs = require('node:fs');
const path = require('node:path');

// tsconfig.json is the single source of truth for the path aliases. TypeScript, Metro and ESLint
// read it directly, and the Jest module name mapper below is derived from it. It is read as plain
// JSON, so it must not contain comments.
const { paths } = require('./tsconfig.json').compilerOptions;

const CORE_LAYERS = ['src/domain', 'src/application'];

/**
 * Jest module name mapper derived from the tsconfig paths:
 * `"@domain/*": ["./src/domain/*"]` becomes `'^@domain/(.*)$': '<rootDir>/src/domain/$1'`.
 * @type {Record<string, string>}
 */
const moduleNameMapper = Object.fromEntries(
  Object.entries(paths).map(([alias, targets]) => {
    const [target] = targets;
    if (target === undefined) throw new Error(`The tsconfig path "${alias}" has no target.`);
    return [
      `^${alias.replace('*', '(.*)')}$`,
      `<rootDir>/${target.replace(/^\.\//, '').replace('*', '$1')}`,
    ];
  }),
);

const TEST_FILES = ['**/*.{test,spec}.{ts,tsx}'];
const TEST_FILE = /\.(test|spec)\.tsx?$/;
const SOURCE_FILE = /\.tsx?$/;

/**
 * True when the directory contains at least one non-test TypeScript source file.
 * @param {string} dir Directory, relative to the repository root.
 * @returns {boolean}
 */
function hasSourceFiles(dir) {
  const absolute = path.join(__dirname, dir);
  if (!fs.existsSync(absolute)) return false;
  return fs.readdirSync(absolute, { withFileTypes: true }).some((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name !== '__tests__' && hasSourceFiles(relative);
    return (
      SOURCE_FILE.test(entry.name) && !entry.name.endsWith('.d.ts') && !TEST_FILE.test(entry.name)
    );
  });
}

// The 90 percent gate is registered for a layer as soon as it contains source code. While a layer
// is still empty, Jest would fail with "coverage data not found" for its path, so it is skipped.
// The empty `global` entry sets no threshold: it only satisfies the Jest typings, which require it.
const coverageThreshold = {
  global: {},
  ...Object.fromEntries(
    CORE_LAYERS.filter(hasSourceFiles).map((dir) => [
      `./${dir}/`,
      { statements: 90, branches: 90, functions: 90, lines: 90 },
    ]),
  ),
};

/**
 * Babel transform for the projects that run without a React Native preset.
 * @type {import('jest').Config['transform']}
 */
const nodeTransform = {
  '\\.[jt]sx?$': [
    'babel-jest',
    {
      babelrc: false,
      configFile: false,
      presets: [require.resolve('expo/internal/babel-preset')],
      caller: { name: 'metro', bundler: 'jest', platform: 'ios' },
    },
  ],
};

/** @type {import('jest').Config} */
const config = {
  collectCoverageFrom: [
    ...CORE_LAYERS.map((dir) => `${dir}/**/*.{ts,tsx}`),
    '!**/*.d.ts',
    '!**/*.{test,spec}.{ts,tsx}',
    '!**/__tests__/**',
    // Test support (fakes of the ports, builders of fixtures), not production code.
    ...CORE_LAYERS.map((dir) => `!${dir}/testing/**`),
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov'],
  coverageThreshold,
  projects: [
    {
      displayName: 'core',
      testEnvironment: 'node',
      roots: CORE_LAYERS.map((dir) => `<rootDir>/${dir}`),
      testMatch: TEST_FILES,
      moduleNameMapper,
      transform: nodeTransform,
    },
    {
      displayName: 'infra',
      preset: 'jest-expo',
      roots: ['<rootDir>/src/infrastructure', '<rootDir>/src/di'],
      testMatch: TEST_FILES,
      moduleNameMapper,
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      roots: ['<rootDir>/src/presentation'],
      testMatch: TEST_FILES,
      moduleNameMapper,
    },
    {
      displayName: 'tooling',
      testEnvironment: 'node',
      roots: ['<rootDir>/tooling'],
      testMatch: TEST_FILES,
      moduleNameMapper,
      transform: nodeTransform,
    },
  ],
};

module.exports = config;
