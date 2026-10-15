// Jest configuration, split in four projects. Every test file must be named `*.test.ts(x)` or
// `*.spec.ts(x)` and live under the root of one of them, otherwise nothing runs it (the
// "tooling" project checks this):
//
// - "core"    : src/domain and src/application, in a plain node environment with no React Native
//               or Expo setup at all. If either layer ever reaches for a framework API, its tests
//               fail here, which keeps both layers framework free.
// - "infra"   : src/infrastructure and src/di, in a plain node environment (see `infraTransform`
//               below). The HTTP adapters are tested against MSW, which needs the `fetch`,
//               `Request` and `Response` of Node, and the SQLite adapters against `node:sqlite`,
//               which only Node has: the jest-expo preset replaces the first with the native
//               ones of Expo, which do not run in Jest. The native modules of Expo that the
//               device adapters wrap (`NATIVE_MODULES`) are empty modules here: the platform
//               factory and the composition root import them like the app does, and nothing native
//               is loaded; `react-native` is a stub that knows the platform. The tests of the
//               thin wrappers replace each module with a stand-in, each with a comment that says
//               why.
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

/**
 * The modules that wrap the device: the database, the keychain, the biometric prompt, the state of
 * the network and the files (Expo), and the crash reporter (Sentry). They exist only on a phone.
 */
const NATIVE_MODULES = [
  'expo-sqlite',
  'expo-secure-store',
  'expo-crypto',
  'expo-file-system',
  'expo-local-authentication',
  'expo-network',
  '@sentry/react-native',
];

/**
 * The "infra" project replaces each of them with an empty module, so that importing the device
 * adapters, as the app does, loads nothing native. The local module ScreenProtection
 * (modules/screen-protection) is replaced the same way, wherever it is imported from by a relative
 * path: the adapter then sees a build without the module, and its tests give it a stand-in.
 * @type {Record<string, string>}
 */
const nativeModuleStubs = Object.fromEntries(
  [...NATIVE_MODULES.map((name) => `^${name}$`), '^(?:\\.\\./)+modules/screen-protection$'].map(
    (pattern) => [pattern, '<rootDir>/src/infrastructure/testing/nativeModuleStub.ts'],
  ),
);

/**
 * `react-native` itself, for the "infra" project: the package is a Flow-typed module that needs the
 * runtime of a phone, and the infrastructure reads one thing from it, the platform it runs on
 * (where the content of the documents is kept). The stub has that and nothing else.
 * @type {Record<string, string>}
 */
const reactNativeStub = {
  '^react-native$': '<rootDir>/src/infrastructure/testing/reactNativeStub.ts',
};

/**
 * The PDF viewer, for the "ui" project: `react-native-pdf` draws with a native view and needs its
 * native module. The stub is a small component that records the properties it was given and lets a
 * test report that the document loaded, changed page or failed. Only one component of the
 * presentation imports the package (a lint rule), so this is the one place that needs it.
 * @type {Record<string, string>}
 */
const pdfViewerStub = {
  '^react-native-pdf$': '<rootDir>/src/presentation/testing/reactNativePdfStub.tsx',
};

/**
 * The local native module ScreenProtection, for the "ui" project: `SecureContent` imports its secure
 * view, a native component. The stub renders the children in a plain view and records the `secure`
 * prop. Only one component of the presentation imports the module (a lint rule).
 * @type {Record<string, string>}
 */
const secureViewStub = {
  '^(?:\\.\\./)+modules/screen-protection$':
    '<rootDir>/src/presentation/testing/screenProtectionSecureViewStub.tsx',
};

/**
 * The Sentry SDK, for the "ui" project: the root layout builds the composition root, which builds
 * the monitoring over the SDK, and the SDK needs its native module. It is the empty module of the
 * "infra" project here too: no test of the screens starts the SDK (it takes an address).
 * @type {Record<string, string>}
 */
const sentryStub = {
  '^@sentry/react-native$': '<rootDir>/src/infrastructure/testing/nativeModuleStub.ts',
};

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
 * Babel, with the Expo preset, for the projects that run without a React Native preset.
 * @type {[string, Record<string, unknown>]}
 */
const babelTransformer = [
  'babel-jest',
  {
    babelrc: false,
    configFile: false,
    presets: [require.resolve('expo/internal/babel-preset')],
    caller: { name: 'metro', bundler: 'jest', platform: 'ios' },
  },
];

/**
 * Babel transform for the projects that run without a React Native preset.
 * @type {import('jest').Config['transform']}
 */
const nodeTransform = { '\\.[jt]sx?$': babelTransformer };

/**
 * The transform of the "infra" project: the same, for `.mjs` files too. MSW 3 and the packages it
 * is made of are ES modules only, and Jest 29 runs CommonJS: Babel turns them into CommonJS like
 * the rest of the code, which needs the transform to know `.mjs` and the packages to be let
 * through `transformIgnorePatterns`. Nothing else is transformed in node_modules. A package that
 * MSW starts to depend on and that is ESM only shows up as a "Cannot use import statement outside
 * a module" error when a test imports `msw`: add it to the list.
 * @type {import('jest').Config['transform']}
 */
const infraTransform = { '\\.m?[jt]sx?$': babelTransformer };

const MSW_PACKAGES = [
  'msw',
  '@msw',
  '@mswjs',
  '@open-draft',
  'until-async',
  'rettime',
  'cookie',
  'headers-polyfill',
  'outvariant',
  'strict-event-emitter',
];

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
      testEnvironment: 'node',
      roots: ['<rootDir>/src/infrastructure', '<rootDir>/src/di'],
      testMatch: TEST_FILES,
      moduleNameMapper: { ...nativeModuleStubs, ...reactNativeStub, ...moduleNameMapper },
      transform: infraTransform,
      transformIgnorePatterns: [`/node_modules/(?!(${MSW_PACKAGES.join('|')})/)`],
    },
    {
      displayName: 'ui',
      preset: 'jest-expo',
      roots: ['<rootDir>/src/presentation'],
      testMatch: TEST_FILES,
      moduleNameMapper: { ...pdfViewerStub, ...secureViewStub, ...sentryStub, ...moduleNameMapper },
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
