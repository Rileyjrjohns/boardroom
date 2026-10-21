import path from 'node:path';

import { defineConfig, globalIgnores } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';
import prettierConfig from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';

/**
 * Architecture, enforced by eslint-plugin-boundaries (v7 settings and rules):
 *
 *   app             -> presentation, di, assets
 *   domain          -> domain
 *   application     -> domain, application
 *   infrastructure  -> domain, application, infrastructure
 *   presentation    -> domain, application, presentation, assets
 *   di              -> domain, application, infrastructure, di
 *
 * domain, application and di import no external module at all. app, infrastructure and
 * presentation may import external modules, except `zod` and the native modules of the device
 * (SQLite, secure storage, secure random numbers, biometrics, network), which only infrastructure
 * may use, and TanStack Query and Zustand, which only presentation may use. The local native
 * module ScreenProtection (`modules/screen-protection`) is imported by `src/infrastructure/native`
 * alone, with one exception: its secure view, a native *view* that no port can carry, which the
 * presentation component `SecureContent` alone imports (see `SECURE_CONTENT_FILE`). `fetch` is used by one module only, the HTTP client.
 * Paths are resolved through tsconfig by eslint-import-resolver-typescript, so the
 * `@domain/*`-style aliases are classified like relative imports.
 *
 * Every file of the repository is visible to the plugin (see `boundaries/include` below). A file
 * that is neither an app, a layer nor an asset (a script, a config, `package.json`, a test
 * helper, and so on) is an unknown file: code under app/ and src/ cannot import it.
 *
 * Known limit, not detectable by a lint rule: an aliased `require` (`const r = require; r('x')`).
 *
 * No hardcoded user-facing text and no magic value, enforced under app/ and src/presentation (see
 * "UI code" below): text is translated, colours are theme tokens, test IDs are constants.
 *
 * In every TypeScript file, the type system stays on: no `any`, no `@ts-ignore`, no `@ts-nocheck`,
 * and a `@ts-expect-error` only with a description.
 *
 * domain and application are also pure, which makes two more claims checkable (see "Core code"
 * below): no `throw` (every failure is an error `Result`) and no read of the system clock (time
 * comes from the `Clock` port). Test support under a `testing` folder can be imported by tests and
 * by other test support only.
 */

const LAYERS = ['domain', 'application', 'infrastructure', 'presentation', 'di'];

const SOURCE_EXTENSIONS = 'js,jsx,mjs,cjs,ts,tsx,mts,cts';
const TYPESCRIPT_EXTENSIONS = 'ts,tsx,mts,cts';

/** Application code, the part of the repository the dependency rule is enforced on. */
const APPLICATION_CODE = [`app/**/*.{${SOURCE_EXTENSIONS}}`, `src/**/*.{${SOURCE_EXTENSIONS}}`];

/** UI code: the route files and the presentation layer, where text is rendered. */
const UI_CODE = [`app/**/*.{${SOURCE_EXTENSIONS}}`, `src/presentation/**/*.{${SOURCE_EXTENSIONS}}`];

/**
 * Where raw colours are allowed: the design tokens, which define them, and the translation
 * resources, which are free text (a key may well be called `color`).
 */
const COLOR_EXEMPT_FILES = [
  `src/presentation/theme/**/*.{${SOURCE_EXTENSIONS}}`,
  `src/presentation/i18n/resources/**/*.{${SOURCE_EXTENSIONS}}`,
];

/** Test files, which may use development dependencies. */
const TEST_FILES = ['**/*.{test,spec}.{ts,tsx}', '**/__tests__/**'];

/**
 * Test support that is not a test file: the fakes and the fixtures that tests share. It lives in a
 * `testing` folder. It is test code, not production code, so a fixture that breaks an invariant may
 * throw to fail the test that uses it. Only tests and other test support may import it.
 */
const TEST_SUPPORT_FILES = ['src/**/testing/**'];

/** The two layers that hold the business rules and must stay pure. */
const CORE_CODE = ['src/domain/**/*', 'src/application/**/*'];

/**
 * Element selector matching one or several architecture elements.
 * @param {...string} types
 */
const element = (...types) => ({ element: { type: types.length === 1 ? types[0] : types } });

/** Selector matching any module that lives in node_modules (or is flagged as external). */
const externalModule = { module: { origin: 'external' } };

/** The packages that hold state, with their subpaths: reserved to the presentation layer. */
const STATE_LIBRARIES = ['@tanstack/**', 'zustand', 'zustand/**'];

/**
 * The native modules of the device, with their subpaths: reserved to the infrastructure layer, where
 * the adapters wrap them behind a port (and, for the ones that hold a secret or a decision, behind
 * a seam that the tests replace).
 */
const DEVICE_PACKAGES = [
  'expo-sqlite',
  'expo-sqlite/**',
  'expo-secure-store',
  'expo-secure-store/**',
  'expo-crypto',
  'expo-crypto/**',
  'expo-file-system',
  'expo-file-system/**',
  'expo-local-authentication',
  'expo-local-authentication/**',
  'expo-network',
  'expo-network/**',
  'expo-updates',
  'expo-updates/**',
];

/**
 * The one file that imports the Sentry SDK: the adapter of the Monitoring port. The dependency policy
 * keeps the package inside src/infrastructure; this keeps it to the adapter, so that the SDK can be
 * replaced by changing one file, and its stand-in in the tests is the one place that has to know it.
 */
const SENTRY_FILE = 'src/infrastructure/monitoring/SentryMonitoring.ts';
const CRASH_REPORTER_PACKAGES = ['@sentry/**'];

/**
 * The local native module ScreenProtection. Only `src/infrastructure/native` imports it, to build
 * the adapter of the `ScreenProtection` port over it; every other layer, and every other folder of
 * the infrastructure, reaches the screen protection through the port.
 */
const NATIVE_MODULE_ELEMENT = 'native-modules';
const NATIVE_MODULE_FILES = ['src/infrastructure/native/**'];

/**
 * The one file of the presentation that imports the native module: the component that mounts its
 * secure view, a native element of the tree that the children of a document are mounted in. A view
 * cannot cross the `ScreenProtection` port (a port carries data and calls), so this is a narrow,
 * deliberate exception: the dependency policy below lets this file, and no other, import the module;
 * `no-restricted-imports` lets it import the entry point only, and neither its default export (the
 * native module, whose functions and events stay behind the port) nor a file inside it.
 */
const SECURE_CONTENT_FILE = 'src/presentation/components/SecureContent.tsx';

/** The one module allowed to call `fetch`: everything that reaches the network goes through it. */
const HTTP_CLIENT_FILE = 'src/infrastructure/http/HttpClient.ts';

const dependencyPolicies = [
  {
    from: element('app'),
    allow: { to: [element('app', 'presentation', 'di', 'assets'), externalModule] },
  },
  {
    from: element('domain'),
    allow: { to: element('domain') },
  },
  {
    from: element('application'),
    allow: { to: element('domain', 'application') },
  },
  {
    from: element('infrastructure'),
    allow: { to: [element('domain', 'application', 'infrastructure'), externalModule] },
  },
  {
    from: element('presentation'),
    allow: { to: [element('domain', 'application', 'presentation', 'assets'), externalModule] },
  },
  {
    from: element('di'),
    allow: { to: element('domain', 'application', 'infrastructure', 'di') },
  },
  // Later policies win over earlier ones. `zod` is reserved to the infrastructure layer.
  {
    from: element('app', 'domain', 'application', 'presentation', 'di'),
    disallow: { to: { module: { origin: 'external', source: 'zod' } } },
    message: 'The "zod" package may only be imported from src/infrastructure.',
  },
  // The native modules of the device belong to the adapters of the infrastructure layer: the other
  // layers reach the device through a port.
  {
    from: element('app', 'domain', 'application', 'presentation', 'di'),
    disallow: { to: { module: { origin: 'external', source: DEVICE_PACKAGES } } },
    message:
      'The native modules of the device (expo-sqlite, expo-secure-store, expo-crypto, expo-file-system, expo-local-authentication, expo-network, expo-updates) may only be imported from src/infrastructure: the other layers reach the device through a port.',
  },
  // The crash reporter is a tool behind the Monitoring port: no layer but the infrastructure knows
  // it exists, and `no-restricted-imports` below keeps that to its adapter.
  {
    from: element('app', 'domain', 'application', 'presentation', 'di'),
    disallow: { to: { module: { origin: 'external', source: CRASH_REPORTER_PACKAGES } } },
    message: `The Sentry SDK (@sentry/*) may only be imported from ${SENTRY_FILE}: every other layer reports through the Monitoring port.`,
  },
  // The local native module of the app is the same kind of thing, and narrower: the infrastructure
  // layer may import it, and `no-restricted-imports` below keeps that to src/infrastructure/native.
  {
    from: element('infrastructure'),
    allow: { to: element(NATIVE_MODULE_ELEMENT) },
  },
  {
    from: element('app', 'domain', 'application', 'presentation', 'di'),
    disallow: { to: element(NATIVE_MODULE_ELEMENT) },
    message:
      'The native module ScreenProtection (modules/screen-protection) may only be imported from src/infrastructure/native: the other layers reach it through the ScreenProtection port.',
  },
  // The exception to the rule above: the one component that mounts the secure view of the module.
  {
    from: { file: { path: SECURE_CONTENT_FILE } },
    allow: { to: element(NATIVE_MODULE_ELEMENT) },
  },
  // Server state (TanStack Query) and interface state (Zustand) are presentation concerns: the
  // other layers hold no framework state, and a route file only mounts what the presentation gives it.
  {
    from: element('app', 'domain', 'application', 'infrastructure', 'di'),
    disallow: { to: { module: { origin: 'external', source: STATE_LIBRARIES } } },
    message:
      'TanStack Query and Zustand may only be imported from src/presentation: server state and UI state belong to it.',
  },
  // A layer alias that fails to resolve would be classified as an external module and slip through
  // the external-module allowances above. Never accept that.
  {
    disallow: {
      to: {
        module: {
          origin: 'external',
          source: LAYERS.map((layer) => `@${layer}/**`),
        },
      },
    },
    message: 'This layer alias does not resolve to a file.',
  },
];

/** Jest APIs that take a module specifier. They load a module like `require` does. */
const JEST_MODULE_APIS =
  'mock|doMock|unmock|dontMock|deepUnmock|setMock|requireActual|requireMock|createMockFromModule|genMockFromModule';
const JEST_MODULE_CALL = `CallExpression[callee.object.name="jest"][callee.property.name=/^(${JEST_MODULE_APIS})$/]`;
const REQUIRE_RESOLVE_CALL =
  'CallExpression[callee.object.name="require"][callee.property.name="resolve"]';

/**
 * Module specifiers that the plugin does not read by default. Each selector must end on the
 * string literal holding the specifier. The first argument of a Jest call is its specifier.
 */
const additionalDependencyNodes = [
  // `type T = import('x').T` and `typeof import('x')`. The source is a direct child of the node
  // with typescript-eslint 8, and wrapped in a TSLiteralType with older versions.
  { selector: 'TSImportType > Literal', kind: 'type', name: 'ts-import-type' },
  {
    selector: 'TSImportType > TSLiteralType > Literal',
    kind: 'type',
    name: 'ts-import-type-legacy',
  },
  // `import x = require('x')`
  {
    selector: 'TSImportEqualsDeclaration > TSExternalModuleReference > Literal',
    kind: 'value',
    name: 'ts-import-equals',
  },
  { selector: `${JEST_MODULE_CALL} > Literal:first-child`, kind: 'value', name: 'jest-module-api' },
  {
    selector: `${REQUIRE_RESOLVE_CALL} > Literal:first-child`,
    kind: 'value',
    name: 'require-resolve',
  },
];

/**
 * The plugin reads string literals only. A specifier built at runtime would hide the dependency,
 * so it is rejected in application code.
 */
const NON_LITERAL_SPECIFIER_MESSAGE =
  'Use a string literal as module specifier: the architecture rules cannot check a computed one.';

/** `globalThis.fetch(...)` and its relatives get round the rule on the `fetch` global. */
const FETCH_MESSAGE = `Do not call fetch here: every request to the network goes through ${HTTP_CLIENT_FILE}.`;

const nonLiteralSpecifierRestrictions = [
  {
    selector:
      'MemberExpression[property.name="fetch"][object.name=/^(?:globalThis|global|window|self)$/]',
    message: FETCH_MESSAGE,
  },
  { selector: 'ImportExpression[source.type!="Literal"]', message: NON_LITERAL_SPECIFIER_MESSAGE },
  {
    selector: 'CallExpression[callee.name="require"][arguments.0.type!="Literal"]',
    message: NON_LITERAL_SPECIFIER_MESSAGE,
  },
  {
    selector: `${JEST_MODULE_CALL}[arguments.0.type!="Literal"]`,
    message: NON_LITERAL_SPECIFIER_MESSAGE,
  },
  {
    selector: `${REQUIRE_RESOLVE_CALL}[arguments.0.type!="Literal"]`,
    message: NON_LITERAL_SPECIFIER_MESSAGE,
  },
];

/**
 * Options of `no-restricted-syntax` for a set of files. In flat config the options of a rule are
 * replaced, not merged, by a later block that matches the same files, so every block must carry
 * every restriction that applies to its files. Building them here puts the restrictions that apply
 * everywhere (the module specifiers, which the architecture rules rely on) in each one of them, and
 * a block cannot lose them by forgetting to repeat them. `tooling/lint-rules.test.ts` checks each
 * set of files.
 * @param {...readonly object[]} lists
 * @returns {['error', ...object[]]}
 */
const restrictSyntax = (...lists) => ['error', ...nonLiteralSpecifierRestrictions, ...lists.flat()];

/** Pattern of `no-restricted-imports` that forbids a path inside node_modules. */
const NODE_MODULES_IMPORT_PATTERN = {
  group: ['**/node_modules/**'],
  message: 'Import a package by its name, not by a path inside node_modules.',
};

/** Pattern of `no-restricted-imports` that forbids the content of a `testing` folder. */
const TESTING_IMPORT_PATTERN = {
  group: ['**/testing', '**/testing/**'],
  message:
    'A testing folder holds test support (fakes, fixtures). Only tests and other test support may import it.',
};

/** Pattern of `no-restricted-imports` that keeps the local native module inside its adapter's folder. */
const NATIVE_MODULE_IMPORT_PATTERN = {
  group: ['**/modules/screen-protection', '**/modules/screen-protection/**'],
  message:
    'The native module ScreenProtection (modules/screen-protection) may only be imported from src/infrastructure/native: everything else reaches it through the ScreenProtection port.',
};

/**
 * What `SecureContent` is not allowed to import from the native module, which it otherwise may: the
 * default export (the native module itself, behind the port) and the module's own files.
 */
const SECURE_VIEW_ONLY_IMPORT_PATTERNS = [
  {
    group: ['**/modules/screen-protection'],
    importNames: ['default', 'ScreenProtectionModule'],
    message: `${SECURE_CONTENT_FILE} may import the secure view of the native module ScreenProtection and nothing else of it: the module itself is reached through the ScreenProtection port.`,
  },
  {
    group: ['**/modules/screen-protection/**'],
    message: `${SECURE_CONTENT_FILE} imports the entry point of the native module ScreenProtection, never a file inside it.`,
  },
];

/**
 * The one file that imports `expo-file-system`: the volume of a device under the file store. The
 * dependency policy above keeps the package inside src/infrastructure; this keeps it to one file,
 * so that the rest of the infrastructure reaches the files through the `FileStore` seam, and what
 * has logic in it is tested in Node.
 */
const FILE_SYSTEM_FILE = 'src/infrastructure/files/ExpoFileVolume.ts';
const FILE_SYSTEM_IMPORT_PATTERN = {
  group: ['expo-file-system', 'expo-file-system/**'],
  message: `expo-file-system may only be imported from ${FILE_SYSTEM_FILE}: everything else reaches the files through the FileStore seam.`,
};

/**
 * The one file that imports `react-native-pdf`: the small component that draws a PDF. Every other
 * file shows a document through it, and Jest replaces the package with a light stub for it alone.
 */
const PDF_VIEWER_FILE = 'src/presentation/components/PdfViewer.tsx';
const PDF_VIEWER_IMPORT_PATTERN = {
  group: ['react-native-pdf', 'react-native-pdf/**'],
  message: `react-native-pdf may only be imported from ${PDF_VIEWER_FILE}: everything else shows a document through that component.`,
};

const SENTRY_IMPORT_PATTERN = {
  group: CRASH_REPORTER_PACKAGES,
  message: `The Sentry SDK (@sentry/*) may only be imported from ${SENTRY_FILE}: everything else reports through the Monitoring port.`,
};

/**
 * Options of `no-restricted-imports` for a set of files, in addition to the patterns that apply to
 * all of them. Replaced, not merged, like the syntax restrictions: see `restrictSyntax`.
 * @param {...{ group: string[], message: string }} patterns
 * @returns {['error', { patterns: { group: string[], message: string }[] }]}
 */
const restrictImports = (...patterns) => [
  'error',
  { patterns: [NODE_MODULES_IMPORT_PATTERN, ...patterns] },
];

/**
 * UI code rules. A string literal is acceptable only when the type system verifies it (a union
 * member, a typed translation key, a typed route). Anything else is a named constant.
 *
 * `react/jsx-no-literals` (eslint-plugin-react 7) covers text written directly as a JSX child:
 * JSX text, `{'text'}` and a template literal. It falls short in two places, which the selectors
 * below complete:
 *
 * - text reached through a conditional, a logical expression, an array or a type assertion
 *   (`{ok ? 'a' : 'b'}`, `{ok && 'a'}`, `{'a' as string}`), which the rule does not see;
 * - props. The rule can only flag all of them (`ignoreProps: false`, which also rejects
 *   `accessibilityRole="header"`) or none. Props are recognised by what they are called instead
 *   (see `TEXT_NAME`), so the props whose values the type system checks stay free.
 *
 * Plain `Literal` nodes are matched on their type, not their value, so that numbers, booleans and
 * `null` are never reported.
 *
 * A selector cannot follow a value through a variable, a function call or a callback. What a
 * selector of this section cannot see is listed in the README ("What it cannot catch").
 */

/**
 * An esquery regular expression matching exactly one of the names.
 * @param {readonly string[]} names
 */
const oneOf = (names) => `/^(?:${names.join('|')})$/`;

/**
 * Capitalises the first letter of a word: `label` gives `Label`.
 * @param {string} word
 */
const capitalise = (word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;

/**
 * Words that make a prop or an option key a text: `title`, `accessibilityLabel`, `headerBackTitle`,
 * `tabBarBadge`. A name pattern instead of a list of known names, so that the props of a library
 * and of the project's own components are covered without being named.
 */
const TEXT_WORDS = [
  'label',
  'title',
  'hint',
  'description',
  'subtitle',
  'message',
  'text',
  'caption',
  'placeholder',
  'badge',
];
/** Either the word alone, or a camelCase name that ends with it. Regular expression source. */
const TEXT_NAME = `(?:${TEXT_WORDS.join('|')}|\\w+(?:${TEXT_WORDS.map(capitalise).join('|')}))`;

/** The `aria-*` props that hold a text. The others hold a state, a number or an id. */
const ARIA_TEXT_PROPS = [
  'aria-label',
  'aria-description',
  'aria-valuetext',
  'aria-roledescription',
  'aria-placeholder',
  'aria-braillelabel',
  'aria-brailleroledescription',
];

/** Props whose value is read by the user: a screen reader, a field, a button. */
const USER_FACING_PROPS = `/^(?:${TEXT_NAME}|alt|${ARIA_TEXT_PROPS.join('|')})$/`;

/** Object keys that carry a text: `title`, `tabBarAccessibilityLabel`, `drawerLabel`, ... */
const USER_FACING_KEYS = `/^${TEXT_NAME}$/`;

/** Props that take an object or a list of objects whose keys can carry text. */
const USER_FACING_OBJECT_PROPS = '/^(?:\\w*[oO]ptions|accessibilityValue|accessibilityActions)$/';

/** Props that identify an element for tests. They are constants, never inline strings. */
const TEST_ID_PROPS = '/^(?:testID|nativeID|\\w+(?:TestID|NativeID))$/';

/**
 * Imperative APIs that show text to the user: `Object.method(...)`. `textArguments` are the
 * positions (counted from 1) of the arguments that hold the text. The others (the `Alert.prompt`
 * input type, the Android toast duration) are typed, and stay free.
 */
const USER_FACING_CALLS = [
  { object: 'Alert', methods: ['alert', 'prompt'], textArguments: [1, 2] },
  {
    object: 'ToastAndroid',
    methods: ['show', 'showWithGravity', 'showWithGravityAndOffset'],
    textArguments: [1],
  },
  {
    object: 'AccessibilityInfo',
    methods: ['announceForAccessibility', 'announceForAccessibilityWithOptions'],
    textArguments: [1],
  },
];

/** Calls that take an object whose keys can carry text: `Share.share({ message })`. */
const USER_FACING_OPTION_CALLS = [
  'CallExpression[callee.object.name="Share"][callee.property.name="share"]',
  'CallExpression[callee.property.name="setOptions"]',
];

/** A call of `t`, or of the `t` method of an i18next instance. */
const TRANSLATE_CALL = 'CallExpression:matches([callee.name="t"], [callee.property.name="t"])';

/**
 * A property, whether its key is written `name`, `'name'` or `['name']`. A computed key that is
 * not a literal (`[name]`) is a variable: its value is unknown, so it never matches.
 * @param {string} names An esquery regular expression.
 */
const propertyNamed = (names) =>
  `:matches(Property[computed=false][key.name=${names}], Property[key.type="Literal"][key.value=${names}])`;

/**
 * Added to the first node under a `Property` selector so that only its value is read. Without it,
 * a key written as a string (`{ 'title': ... }`, `{ ['title']: ... }`) would be read as a text too.
 */
const VALUE_OF_PROPERTY = '.value';

/** A string literal, or a template literal with static text in it. */
const TEXT =
  ':matches(Literal[value=type(string)][value=/\\S/], TemplateLiteral:has(TemplateElement[value.raw=/\\S/]))';
/** A string literal only (a prop written `prop="text"`). */
const STRING = 'Literal[value=type(string)][value=/\\S/]';

/** Wrappers that change the type of an expression, not its value: `'text' as string`, `'text'!`. */
const TYPE_WRAPPERS = 'TSAsExpression, TSNonNullExpression, TSSatisfiesExpression, TSTypeAssertion';
/** Nodes a value can travel through on its way to a prop, a style or an argument. */
const VALUE_CARRIER = `:matches(ConditionalExpression, LogicalExpression, ${TYPE_WRAPPERS})`;
/** Nodes a string can travel through on its way to the screen as a JSX child. */
const CHILD_CARRIER = `:matches(ConditionalExpression, LogicalExpression, ArrayExpression, ${TYPE_WRAPPERS})`;
/** As above, for a prop: also a concatenation (`'Close ' + name`) and a template literal. */
const PROP_CARRIER = `:matches(ConditionalExpression, LogicalExpression, BinaryExpression[operator="+"], TemplateLiteral, ${TYPE_WRAPPERS})`;

/**
 * How many carriers deep a selector looks. A conditional nested deeper than this is not read, which
 * no real component needs.
 */
const MAX_CARRIER_DEPTH = 8;

/**
 * A selector for each nesting depth of `carrier`, from `minDepth` to `MAX_CARRIER_DEPTH`, going
 * from `root` down to `leaf`. `firstHop` is added to the node right under `root`, which is how an
 * argument is picked by its position (`:nth-child(2)`).
 * @param {string} root
 * @param {string} carrier
 * @param {string} leaf
 * @param {{ firstHop?: string, minDepth?: number }} [options]
 */
function throughCarriers(root, carrier, leaf, { firstHop = '', minDepth = 0 } = {}) {
  const selectors = [];
  for (let depth = minDepth; depth <= MAX_CARRIER_DEPTH; depth += 1) {
    const hops = [...Array.from({ length: depth }, () => carrier), leaf];
    hops[0] = `${hops[0]}${firstHop}`;
    selectors.push([root, ...hops].join(' > '));
  }
  return selectors;
}

/**
 * A `no-restricted-syntax` entry for each selector.
 * @param {readonly string[]} selectors
 * @param {string} message
 */
const restrict = (selectors, message) => selectors.map((selector) => ({ selector, message }));

const UNTRANSLATED_TEXT = 'Hardcoded user-facing text in JSX. Use a translation key: t("...").';
const UNTRANSLATED_PROP = 'Hardcoded text in a user-facing prop. Use a translation key: t("...").';
const UNTRANSLATED_OPTION =
  'Hardcoded text in a user-facing option. Use a translation key: t("...").';
const DEFAULT_TEXT =
  'A default text bypasses the translations. Add the key to the resources and read it with t("...").';
const TEST_ID_MESSAGE =
  'Raw test ID. Declare it once in a constants module and reference the constant.';

const untranslatedTextRestrictions = [
  // Depth 0 is `react/jsx-no-literals`' job: do not report the same node twice.
  ...restrict(
    throughCarriers(
      ':matches(JSXElement, JSXFragment) > JSXExpressionContainer',
      CHILD_CARRIER,
      TEXT,
      { minDepth: 1 },
    ),
    UNTRANSLATED_TEXT,
  ),
  ...restrict([`JSXAttribute[name.name=${USER_FACING_PROPS}] > ${STRING}`], UNTRANSLATED_PROP),
  ...restrict(
    throughCarriers(
      `JSXAttribute[name.name=${USER_FACING_PROPS}] > JSXExpressionContainer`,
      PROP_CARRIER,
      TEXT,
    ),
    UNTRANSLATED_PROP,
  ),
  ...restrict(
    throughCarriers(
      `JSXAttribute[name.name=${USER_FACING_OBJECT_PROPS}] ${propertyNamed(USER_FACING_KEYS)}`,
      PROP_CARRIER,
      TEXT,
      { firstHop: VALUE_OF_PROPERTY },
    ),
    UNTRANSLATED_OPTION,
  ),
  ...USER_FACING_CALLS.flatMap(({ object, methods, textArguments }) =>
    textArguments.flatMap((position) =>
      restrict(
        throughCarriers(
          `CallExpression[callee.object.name="${object}"][callee.property.name=${oneOf(methods)}]`,
          PROP_CARRIER,
          TEXT,
          { firstHop: `:nth-child(${position})` },
        ),
        `Hardcoded text passed to ${object}. Use a translation key: t("...").`,
      ),
    ),
  ),
  // The buttons of an alert: `Alert.alert(title, message, [{ text: 'OK' }])`.
  ...restrict(
    throughCarriers(
      `CallExpression[callee.object.name="Alert"] ${propertyNamed('/^text$/')}`,
      PROP_CARRIER,
      TEXT,
      { firstHop: VALUE_OF_PROPERTY },
    ),
    'Hardcoded text in an alert button. Use a translation key: t("...").',
  ),
  ...USER_FACING_OPTION_CALLS.flatMap((call) =>
    restrict(
      throughCarriers(`${call} ${propertyNamed(USER_FACING_KEYS)}`, PROP_CARRIER, TEXT, {
        firstHop: VALUE_OF_PROPERTY,
      }),
      UNTRANSLATED_OPTION,
    ),
  ),
  // `t('key', 'Some text')` and `t('key', { defaultValue: 'Some text' })`. The types reject an
  // unknown key even then, but a default text on a valid key is still a text outside the resources.
  ...restrict(
    throughCarriers(TRANSLATE_CALL, PROP_CARRIER, TEXT, { firstHop: ':nth-child(2)' }),
    DEFAULT_TEXT,
  ),
  ...restrict(
    throughCarriers(
      `${TRANSLATE_CALL} > ObjectExpression > ${propertyNamed('/^defaultValue$/')}`,
      PROP_CARRIER,
      TEXT,
      { firstHop: VALUE_OF_PROPERTY },
    ),
    DEFAULT_TEXT,
  ),
];

const testIdRestrictions = restrict(
  [
    `JSXAttribute[name.name=${TEST_ID_PROPS}] > ${STRING}`,
    ...throughCarriers(
      `JSXAttribute[name.name=${TEST_ID_PROPS}] > JSXExpressionContainer`,
      PROP_CARRIER,
      TEXT,
    ),
  ],
  TEST_ID_MESSAGE,
);

const HEX_COLOR = '/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i';
const COLOR_FUNCTION = '/^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\\(/i';
const COLOR_MESSAGE = 'Raw colour. Use a token from src/presentation/theme/tokens.ts.';

/**
 * Style properties that hold a colour: `color`, `backgroundColor`, `borderTopColor`, ...
 *
 * Only inside a style (see `STYLE_CONTEXTS`), where such a property always takes a colour. A prop
 * called `color` or `backgroundColor` on a component (`<Badge color="primary" />`) can just as well
 * take a union of token names, which the type system verifies: it is not reported.
 */
const COLOR_STYLE_PROPERTIES = '/^(?:color|\\w+Color)$/';

const STYLE_PROPS = '/^(?:style|\\w+Style)$/';
const STYLE_TYPES = '/^(?:StyleProp|ViewStyle|TextStyle|ImageStyle)$/';
/** Where an object literal is a style: the `style` props, `StyleSheet` and values typed as a style. */
const STYLE_CONTEXTS = [
  `JSXAttribute[name.name=${STYLE_PROPS}]`,
  'CallExpression[callee.object.name="StyleSheet"][callee.property.name=/^(?:create|flatten|compose)$/]',
  `VariableDeclarator[id.typeAnnotation.typeAnnotation.typeName.name=${STYLE_TYPES}]`,
  `:matches(TSSatisfiesExpression, TSAsExpression)[typeAnnotation.typeName.name=${STYLE_TYPES}]`,
];

/** Text given to a colour property, minus what the value based selectors below already report. */
const OTHER_COLOR_TEXT = `:matches(Literal[value=type(string)][value=/\\S/]:not([value=${HEX_COLOR}]):not([value=${COLOR_FUNCTION}]), TemplateLiteral:has(TemplateElement[value.raw=/\\S/]))`;

const colorRestrictions = [
  // A hex or functional colour is a colour wherever it is written.
  { selector: `Literal[value=${HEX_COLOR}]`, message: COLOR_MESSAGE },
  { selector: `Literal[value=${COLOR_FUNCTION}]`, message: COLOR_MESSAGE },
  // Named colours ('red', 'transparent') cannot be told from other strings by their value, so
  // every string given to a colour property of a style is rejected.
  ...STYLE_CONTEXTS.flatMap((context) =>
    restrict(
      throughCarriers(
        `${context} ${propertyNamed(COLOR_STYLE_PROPERTIES)}`,
        VALUE_CARRIER,
        OTHER_COLOR_TEXT,
        { firstHop: VALUE_OF_PROPERTY },
      ),
      COLOR_MESSAGE,
    ),
  ),
];

/**
 * Globals that give a file access to the runtime environment: network, storage, timers, the DOM,
 * the process. Pure business code reaches the outside world through ports only.
 */
const AMBIENT_GLOBALS = [
  'process',
  'global',
  'globalThis',
  'self',
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'Buffer',
  'console',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'clearImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
];

/**
 * Core code: domain and application. Errors are values and time is a port, so that the business
 * rules are deterministic and testable without a clock or a try/catch.
 */
const THROW_MESSAGE =
  'Do not throw: return an error Result (err(...)). No exception crosses a layer.';
const CLOCK_MESSAGE =
  'Do not read the system clock. Time comes from the Clock port: inject it and call clock.now().';

/**
 * A read of the property `now` of a global object, called or not: `Date.now()`, `const read =
 * Date.now`, `Date['now']()`.
 * @param {string} object
 */
const nowOf = (object) =>
  `:matches(MemberExpression[computed=false][property.name="now"], MemberExpression[computed=true][property.value="now"])[object.name="${object}"]`;

const noThrowRestrictions = [{ selector: 'ThrowStatement', message: THROW_MESSAGE }];

const noSystemClockRestrictions = [
  { selector: nowOf('Date'), message: CLOCK_MESSAGE },
  { selector: nowOf('performance'), message: CLOCK_MESSAGE },
  // `new Date()` with no argument is the current time; `new Date(millis)` is a conversion.
  { selector: 'NewExpression[callee.name="Date"][arguments.length=0]', message: CLOCK_MESSAGE },
  // `Date()` called as a function returns the current time as a string.
  { selector: 'CallExpression[callee.name="Date"]', message: CLOCK_MESSAGE },
];

/** Parser and plugin of the TypeScript files, as configured by eslint-config-expo. */
const typescriptConfig = expoConfig.find((config) => config.plugins?.['@typescript-eslint']);
const typescriptParser = typescriptConfig?.languageOptions?.parser;
const typescriptPlugin = typescriptConfig?.plugins?.['@typescript-eslint'];
if (!typescriptParser || !typescriptPlugin) {
  throw new Error('eslint-config-expo no longer exposes its TypeScript parser and plugin.');
}

export default defineConfig([
  globalIgnores(['node_modules/', '.expo/', 'dist/', 'coverage/', 'ios/', 'android/']),

  ...expoConfig,

  {
    // CommonJS tooling configs and config plugins run in Node.js, outside of the React Native runtime.
    files: ['**/*.config.js', '**/*.config.cjs', 'plugins/**/*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { __dirname: 'readonly', module: 'writable', require: 'readonly' },
    },
  },

  {
    // eslint-config-expo only knows .ts and .tsx. Lint the ES module and CommonJS flavours with
    // the same parser, so that no source file escapes the rules below.
    files: ['**/*.mts', '**/*.cts'],
    plugins: { '@typescript-eslint': typescriptPlugin },
    languageOptions: { parser: typescriptParser },
  },

  {
    // The type system is never switched off: no `any`, no `@ts-ignore`, no `@ts-nocheck`. A
    // `@ts-expect-error` (a type test that must fail the typecheck) says why, in ten characters at
    // least. Every TypeScript file of the repository, tooling and configs included.
    files: [`**/*.{${TYPESCRIPT_EXTENSIONS}}`],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          minimumDescriptionLength: 10,
        },
      ],
    },
  },

  {
    plugins: { boundaries },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          // Absolute, so that aliases resolve whatever the working directory of ESLint is.
          project: path.join(import.meta.dirname, 'tsconfig.json'),
        },
      },
      'boundaries/root-path': import.meta.dirname,
      // Every file of the repository is visible to the plugin, dot files and dot folders included
      // (micromatch ignores them unless a pattern names them). A file that is not an app, a layer
      // or an asset is therefore an unknown file, and importing it is rejected.
      'boundaries/include': ['**/*', '**/.*', '**/.*/**'],
      // Patterns are matched against the full path from the root, not only its tail.
      'boundaries/elements': [
        { type: 'app', pattern: 'app', partialMatch: false },
        { type: 'assets', pattern: 'assets', partialMatch: false },
        { type: NATIVE_MODULE_ELEMENT, pattern: 'modules', partialMatch: false },
        ...LAYERS.map((layer) => ({
          type: layer,
          pattern: `src/${layer}`,
          partialMatch: false,
        })),
      ],
      'boundaries/additional-dependency-nodes': additionalDependencyNodes,
    },
  },

  {
    // The dependency rule applies to application code. Repository tooling (configs, scripts,
    // tooling tests) is free to import anything.
    files: APPLICATION_CODE,
    rules: {
      // Any file under app/ or src/ that is not part of a known element is an error.
      'boundaries/no-unknown-files': 'error',
      // Importing a local file that is not part of a known element is an error.
      'boundaries/no-unknown-dependencies': 'error',
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          // Also check node_modules and Node.js core imports, not only local files.
          checkAllOrigins: true,
          policies: dependencyPolicies,
        },
      ],
      'no-restricted-syntax': restrictSyntax(),
      // Packages are imported by name, never by their location in node_modules.
      'no-restricted-imports': restrictImports(
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },

  {
    // The local native module is imported by its adapter's folder only (the options of
    // `no-restricted-imports` are replaced, not merged: the blocks below repeat this pattern).
    files: APPLICATION_CODE,
    ignores: NATIVE_MODULE_FILES,
    rules: {
      'no-restricted-imports': restrictImports(
        NATIVE_MODULE_IMPORT_PATTERN,
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },

  {
    // Production code cannot import test support (the options of `no-restricted-imports` are
    // replaced, not merged: `restrictImports` carries the pattern of the blocks above).
    files: APPLICATION_CODE,
    ignores: [...TEST_FILES, ...TEST_SUPPORT_FILES, ...NATIVE_MODULE_FILES],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        NATIVE_MODULE_IMPORT_PATTERN,
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },
  {
    // The same for the folder of the native adapter, which is where the native module is allowed.
    files: NATIVE_MODULE_FILES,
    ignores: [...TEST_FILES, ...TEST_SUPPORT_FILES],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },
  {
    // The volume of the device is where `expo-file-system` is allowed, and the PDF viewer is where
    // `react-native-pdf` is: each is exempt from its own pattern and from that one only.
    files: [FILE_SYSTEM_FILE],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        NATIVE_MODULE_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },
  {
    files: [PDF_VIEWER_FILE],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        NATIVE_MODULE_IMPORT_PATTERN,
        FILE_SYSTEM_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },
  {
    // The component of the secure view is where the entry point of the native module is allowed,
    // for the secure view only: exempt from the pattern of the module, not from the others.
    files: [SECURE_CONTENT_FILE],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        ...SECURE_VIEW_ONLY_IMPORT_PATTERNS,
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
        SENTRY_IMPORT_PATTERN,
      ),
    },
  },
  {
    // The adapter of the Monitoring port is where the Sentry SDK is allowed: exempt from its own
    // pattern and from that one only.
    files: [SENTRY_FILE],
    rules: {
      'no-restricted-imports': restrictImports(
        TESTING_IMPORT_PATTERN,
        NATIVE_MODULE_IMPORT_PATTERN,
        FILE_SYSTEM_IMPORT_PATTERN,
        PDF_VIEWER_IMPORT_PATTERN,
      ),
    },
  },

  {
    // A `/// <reference path="..." />` pulls a file in without any import statement.
    files: [`app/**/*.{${TYPESCRIPT_EXTENSIONS}}`, `src/**/*.{${TYPESCRIPT_EXTENSIONS}}`],
    rules: {
      '@typescript-eslint/triple-slash-reference': [
        'error',
        { path: 'never', types: 'always', lib: 'always' },
      ],
    },
  },

  {
    // Every imported package must be declared in package.json. Development dependencies are for
    // tooling, tests and test support only, never for code that ships in the app.
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: true, optionalDependencies: false, peerDependencies: false },
      ],
    },
  },
  {
    // Production code cannot use a development dependency. Test files and test support (fakes,
    // fixtures, render helpers) are test code, and can.
    files: APPLICATION_CODE,
    ignores: [...TEST_FILES, ...TEST_SUPPORT_FILES],
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        { devDependencies: false, optionalDependencies: false, peerDependencies: false },
      ],
    },
  },

  {
    // UI code renders no hardcoded text and holds no magic value (see `restrictSyntax` for why
    // each block lists its restrictions in full).
    files: UI_CODE,
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'no-restricted-syntax': restrictSyntax(
        untranslatedTextRestrictions,
        testIdRestrictions,
        colorRestrictions,
      ),
    },
  },
  {
    // The design tokens are where raw colours are written.
    files: COLOR_EXEMPT_FILES,
    rules: {
      'no-restricted-syntax': restrictSyntax(untranslatedTextRestrictions, testIdRestrictions),
    },
  },

  {
    // domain and application are pure: no `throw`, no read of the system clock.
    files: CORE_CODE,
    ignores: [...TEST_FILES, ...TEST_SUPPORT_FILES],
    rules: {
      'no-restricted-syntax': restrictSyntax(noThrowRestrictions, noSystemClockRestrictions),
    },
  },

  {
    // One module talks to the network. (domain and application restrict `fetch` among every other
    // ambient global in the block below, which comes later and replaces these options for them.)
    files: APPLICATION_CODE,
    ignores: [HTTP_CLIENT_FILE, ...TEST_FILES, ...TEST_SUPPORT_FILES],
    rules: {
      'no-restricted-globals': ['error', { name: 'fetch', message: FETCH_MESSAGE }],
    },
  },

  {
    // domain and application are pure: no ambient global that reaches the runtime environment.
    files: CORE_CODE,
    ignores: TEST_FILES,
    rules: {
      'no-restricted-globals': [
        'error',
        ...AMBIENT_GLOBALS.map((name) => ({
          name,
          message: `"${name}" gives access to the runtime environment. Business code reaches it through a port implemented in src/infrastructure.`,
        })),
      ],
    },
  },

  // Keep last: turns off every stylistic rule that Prettier already owns.
  prettierConfig,
]);
