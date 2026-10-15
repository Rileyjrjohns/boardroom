import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Checks what the ESLint configuration accepts and rejects: in UI code, no hardcoded user-facing
// text, no raw colour, no raw test ID; in domain and application code, no `throw` and no read of the
// system clock; in production code, no import of test support. Each snippet is linted with the real
// configuration, through tooling/lint-snippets.mjs, in a single ESLint process.
//
// Only the rules that enforce these conventions are looked at, so that an unrelated finding (an
// unused import in a snippet) cannot hide a regression. A snippet that does not parse always fails.

const SCRIPT = path.resolve(__dirname, 'lint-snippets.mjs');

const SCREEN = 'src/presentation/screens/Sample.tsx';
const ROUTE = 'app/sample.tsx';
const THEME = 'src/presentation/theme/sample.ts';
const RESOURCES = 'src/presentation/i18n/resources/sample.ts';

const DOMAIN = 'src/domain/entities/Sample.ts';
const APPLICATION = 'src/application/use-cases/Sample.ts';
const DOMAIN_TEST = 'src/domain/entities/Sample.test.ts';
const APPLICATION_TEST = 'src/application/use-cases/Sample.test.ts';
const TEST_SUPPORT = 'src/application/testing/FakeSample.ts';
const INFRASTRUCTURE = 'src/infrastructure/http/sample.ts';
const PERSISTENCE = 'src/infrastructure/persistence/Sample.ts';
const HTTP_CLIENT = 'src/infrastructure/http/HttpClient.ts';
const INFRASTRUCTURE_TEST = 'src/infrastructure/http/Sample.test.ts';
const INFRASTRUCTURE_TEST_SUPPORT = 'src/infrastructure/testing/sample.ts';

const DI = 'src/di/sample.ts';
const PRESENTATION_HOOK = 'src/presentation/hooks/useSample.ts';

/** The rule of the dependency policies of the architecture (the layers, the reserved packages). */
const BOUNDARY_RULES = new Set(['boundaries/dependencies']);

/** The rule on the ambient globals: `fetch` outside the HTTP client. */
const GLOBAL_RULES = new Set(['no-restricted-globals']);

const CONVENTION_RULES = new Set([
  'no-restricted-syntax',
  'no-restricted-imports',
  'react/jsx-no-literals',
]);

interface Snippet {
  readonly filePath: string;
  readonly code: string;
}

interface Finding {
  readonly ruleId: string | null;
  readonly message: string;
}

/** A module that declares the identifiers the snippets rely on, followed by `statements`. */
function sourceFile(statements: string): string {
  return [
    "import { AccessibilityInfo, Alert, Image, Share, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';",
    "import type { ImageStyle, StyleProp, TextStyle, ViewStyle } from 'react-native';",
    'declare function Badge(props: { color?: "primary" | "danger"; backgroundColor?: "surface" }): null;',
    'declare const t: (key: string) => string;',
    'declare const i18n: { t: (key: string) => string };',
    'declare const navigation: { setOptions: (options: object) => void };',
    'declare const name: string;',
    'declare const id: string;',
    'declare const ok: boolean;',
    'declare const n: number;',
    statements,
    'export const unused = [AccessibilityInfo, Alert, Badge, Image, Share, StyleSheet, Text];',
    'export const unusedToo = [TextInput, ToastAndroid, View, i18n, navigation, id, n, name, ok, t];',
    'export type Unused = [ImageStyle, StyleProp<ViewStyle>, TextStyle];',
  ].join('\n');
}

/** A component that renders `body`. */
function component(body: string): string {
  return sourceFile(['export const Sample = () => (', `  <View>${body}</View>`, ');'].join('\n'));
}

const snippets: Snippet[] = [];

/** Registers a snippet, so that it is linted with all the others. */
function register(filePath: string, code: string): Snippet {
  const snippet = { filePath, code };
  snippets.push(snippet);
  return snippet;
}

/** Registers one snippet per entry of `cases`, in `filePath`, written by `write`. */
function registerAll(
  cases: Record<string, string>,
  write: (source: string) => string,
  filePath: string = SCREEN,
): [string, Snippet][] {
  return Object.entries(cases).map(([name, source]) => [name, register(filePath, write(source))]);
}

/** Text that must be translated, and values that must be constants, written in JSX. */
const rejectedJsx = {
  'JSX text': '<Text>Hello</Text>',
  'a string in an expression container': "<Text>{'Hello'}</Text>",
  'a template literal': '<Text>{`Hello ${name}`}</Text>',
  'a concatenation': "<Text>{'Hello ' + name}</Text>",
  'a conditional': "<Text>{ok ? 'Yes' : 'No'}</Text>",
  'a conditional with a template literal': '<Text>{ok ? `Hello ${name}` : null}</Text>',
  'a nested conditional': "<Text>{ok ? (n > 1 ? 'many' : 'one') : 'none'}</Text>",
  'a conditional nested five deep':
    "<Text>{ok ? (ok ? (ok ? (ok ? (ok ? 'deep' : t('a')) : t('b')) : t('c')) : t('d')) : t('e')}</Text>",
  'a logical AND': "<Text>{ok && 'Yes'}</Text>",
  'a logical OR': "<Text>{name || 'Anonymous'}</Text>",
  'a type assertion': "<Text>{'Hello' as string}</Text>",
  'a non-null assertion': "<Text>{'Hello'!}</Text>",
  'a satisfies expression': "<Text>{'Hello' satisfies string}</Text>",
  'a conditional in a type assertion': "<Text>{(ok ? 'Yes' : 'No') as string}</Text>",
  'an array of strings': "<Text>{['Hello', 'World']}</Text>",
  'a conditional in an array': "<Text>{[ok ? 'Yes' : t('a')]}</Text>",
  accessibilityLabel: '<View accessibilityLabel="Close" />',
  'accessibilityLabel in an expression container': "<View accessibilityLabel={'Close'} />",
  'accessibilityLabel with a template literal': '<View accessibilityLabel={`Close ${name}`} />',
  'accessibilityLabel with a conditional': "<View accessibilityLabel={ok ? 'Open' : 'Close'} />",
  'accessibilityLabel with a concatenation': "<View accessibilityLabel={'Close ' + name} />",
  'accessibilityLabel with a conditional in a template literal':
    "<View accessibilityLabel={`${ok ? 'Open' : 'Close'}`} />",
  'accessibilityLabel with a type assertion': "<View accessibilityLabel={'Close' as string} />",
  accessibilityHint: '<View accessibilityHint="Double tap to close" />',
  'aria-label': '<View aria-label="Close" />',
  'aria-roledescription': '<View aria-roledescription="Slider" />',
  placeholder: '<TextInput placeholder="Your name" />',
  title: '<View title="Settings" />',
  label: '<View label="Settings" />',
  alt: '<Image alt="Logo" source={1} />',
  hint: '<View hint="Tap" />',
  description: '<View description="A description" />',
  subtitle: '<View subtitle="A subtitle" />',
  message: '<View message="A message" />',
  text: '<View text="Some text" />',
  'a prop that ends with Label': '<View tabBarAccessibilityLabel="Home" />',
  'a prop that ends with Title': '<View headerBackTitle="Back" />',
  'a prop that ends with Text': '<View emptyText="Nothing here" />',
  'a title in options': "<View options={{ title: 'Home' }} />",
  'a title in options, as a quoted key': "<View options={{ 'title': 'Home' }} />",
  'a title in options, as a computed key': "<View options={{ ['title']: 'Home' }} />",
  'a title in options, behind a conditional': "<View options={{ title: ok ? 'Home' : 'Back' }} />",
  'a title in screenOptions': "<View screenOptions={{ title: 'Home' }} />",
  'a tabBarAccessibilityLabel in options':
    "<View options={{ tabBarAccessibilityLabel: 'Home tab' }} />",
  'a drawerLabel in options': "<View options={{ drawerLabel: 'Home' }} />",
  'a headerBackAccessibilityLabel in options':
    "<View options={{ headerBackAccessibilityLabel: 'Back' }} />",
  'a tabBarBadge in options': "<View options={{ tabBarBadge: 'new' }} />",
  'a label in accessibilityActions':
    "<View accessibilityActions={[{ name: 'activate', label: 'Open' }]} />",
  'an accessibilityValue text': "<View accessibilityValue={{ text: 'half' }} />",
  'an Alert title': "<View onLayout={() => Alert.alert('Oops')} />",
  'an Alert title and message': "<View onLayout={() => Alert.alert('Oops', 'Broken')} />",
  'an Alert title behind a conditional':
    "<View onLayout={() => Alert.alert(ok ? 'Oops' : 'Fine')} />",
  'an Alert message': "<View onLayout={() => Alert.alert(t('a'), 'Broken')} />",
  'an Alert prompt message': "<View onLayout={() => Alert.prompt(t('a'), 'Your name')} />",
  'an Alert button': "<View onLayout={() => Alert.alert(t('a'), t('b'), [{ text: 'OK' }])} />",
  'an Alert button behind a conditional':
    "<View onLayout={() => Alert.alert(t('a'), t('b'), [{ text: ok ? 'OK' : 'Yes' }])} />",
  'a toast': "<View onLayout={() => ToastAndroid.show('Saved', ToastAndroid.SHORT)} />",
  'an accessibility announcement':
    "<View onLayout={() => AccessibilityInfo.announceForAccessibility('Saved')} />",
  'a shared message': "<View onLayout={() => Share.share({ message: 'Hello' })} />",
  'a shared title behind a conditional':
    "<View onLayout={() => Share.share({ title: ok ? 'Hello' : 'Bye' })} />",
  'a title set on the navigation':
    "<View onLayout={() => navigation.setOptions({ title: 'Home' })} />",
  'a default text': "<Text>{t('app.name', 'Boardroom')}</Text>",
  'a default text behind a conditional': "<Text>{t('app.name', ok ? 'A' : 'B')}</Text>",
  'a default text in the options': "<Text>{t('app.name', { defaultValue: 'Boardroom' })}</Text>",
  'a default text in the options, behind a conditional':
    "<Text>{t('app.name', { defaultValue: ok ? 'A' : 'B' })}</Text>",
  'a default text of an i18next instance': "<Text>{i18n.t('app.name', 'Boardroom')}</Text>",
  'a testID': '<View testID="home" />',
  'a testID in an expression container': "<View testID={'home'} />",
  'a testID with a template literal': '<View testID={`row-${id}`} />',
  'a testID behind a conditional': "<View testID={ok ? 'a' : 'b'} />",
  'a nativeID': '<View nativeID="home" />',
  'a prop that ends with TestID': '<View itemTestID="home" />',
  'a hex colour': "<View style={{ backgroundColor: '#ffffff' }} />",
  'a short hex colour': "<View style={{ backgroundColor: '#fff' }} />",
  'a hex colour with alpha': "<View style={{ borderColor: '#ffffff80' }} />",
  'a hex colour on a component': '<Badge color="#ffffff" />',
  'a colour function': "<View style={{ shadowColor: 'rgba(0, 0, 0, 0.5)' }} />",
  'a named colour': "<View style={{ backgroundColor: 'red' }} />",
  transparent: "<View style={{ color: 'transparent' }} />",
  'a named colour in a style array': "<View style={[{ color: 'red' }]} />",
  'a named colour in a style that is named like a style':
    "<View contentContainerStyle={{ color: 'red' }} />",
  'a named colour behind a conditional':
    "<View style={{ backgroundColor: ok ? 'red' : 'blue' }} />",
  'a named colour next to a token':
    "<View style={{ backgroundColor: ok ? 'red' : colors.background }} />",
  'a named colour as a quoted key': "<View style={{ 'backgroundColor': 'red' }} />",
  'a named colour as a computed key': "<View style={{ ['backgroundColor']: 'red' }} />",
  'a named colour with a type assertion': "<View style={{ color: 'red' as string }} />",
} as const;

const acceptedJsx = {
  'a translation key': "<Text>{t('app.name')}</Text>",
  'a typed accessibilityRole': '<Text accessibilityRole="header">{t(\'app.name\')}</Text>',
  'a typed resizeMode': '<Image source={1} resizeMode="cover" alt={t(\'a\')} />',
  'typed props': '<TextInput autoComplete="email" keyboardType="numeric" returnKeyType="done" />',
  'typed aria props': '<View aria-live="polite" role="button" aria-label={t(\'a\')} />',
  'a translated accessibilityLabel': "<View accessibilityLabel={t('a.b')} />",
  'a translated accessibilityLabel in a conditional':
    "<View accessibilityLabel={ok ? t('a') : t('b')} />",
  'a key chosen by a conditional': "<Text>{t(ok ? 'a.b' : 'c.d')}</Text>",
  'a comparison with a literal': "<Text>{name === 'x' ? t('a') : t('b')}</Text>",
  'a logical expression after a comparison': "<Text>{name === 'x' && t('a')}</Text>",
  'a comparison in a type assertion': "<Text>{(name === 'x' ? t('a') : t('b')) as string}</Text>",
  'an array of translations': "<Text>{[t('a'), t('b')]}</Text>",
  'a non-null translation': "<Text>{t('a')!}</Text>",
  'a testID that is not a literal': '<View testID={name} />',
  'a number': '<Text>{n}</Text>',
  'a whitespace child': "<Text>{' '}{t('a')}</Text>",
  'a null branch': "<Text>{ok ? t('a') : null}</Text>",
  'typed style values': "<View style={{ alignItems: 'center', fontWeight: '700', flex: 1 }} />",
  'a colour scheme': "<View style={{ colorScheme: 'dark' }} />",
  'a colour that is not a literal': '<View style={{ backgroundColor: name }} />',
  'a colour token in a conditional': '<View style={{ backgroundColor: ok ? name : id }} />',
  'a colour prop typed as a union of token names': '<Badge color="primary" />',
  'a background colour prop typed as a union of token names': '<Badge backgroundColor="surface" />',
  'a title that is not a literal': '<View options={{ title: name }} />',
  'typed navigation options':
    "<View options={{ presentation: 'modal', animation: 'fade', headerTitleAlign: 'center', tabBarLabelPosition: 'below-icon', headerShown: false }} />",
  'a translated title behind a conditional': "<View options={{ title: ok ? t('a') : t('b') }} />",
  'an Alert with translations': "<View onLayout={() => Alert.alert(t('a'), t('b'))} />",
  'an Alert with translated buttons':
    "<View onLayout={() => Alert.alert(t('a'), t('b'), [{ text: t('c'), style: 'cancel' }])} />",
  'an Alert prompt with a typed input type':
    "<View onLayout={() => Alert.prompt(t('a'), t('b'), undefined, 'plain-text', undefined, 'numeric')} />",
  'a toast with a duration':
    "<View onLayout={() => ToastAndroid.show(t('a'), ToastAndroid.SHORT)} />",
  'an announcement with options':
    "<View onLayout={() => AccessibilityInfo.announceForAccessibilityWithOptions(t('a'), { queue: true })} />",
  'a translated share': "<View onLayout={() => Share.share({ message: t('a') })} />",
  'a translation with a count': "<Text>{t('a', { count: 1 })}</Text>",
  'a translation with a variable count': "<Text>{t('a', { count: n })}</Text>",
  'numbers in an accessibilityValue': '<View accessibilityValue={{ min: 0, max: 1, now: 1 }} />',
} as const;

/** The same rules apply outside of JSX, where the colours of a style are written. */
const rejectedStatements = {
  'a named colour in StyleSheet.create':
    "export const styles = StyleSheet.create({ box: { color: 'red' } });",
  'a named colour in StyleSheet.flatten':
    "export const flat = StyleSheet.flatten({ color: 'red' });",
  'a named colour behind a conditional in StyleSheet.create':
    "export const styles = StyleSheet.create({ box: { color: ok ? 'red' : 'blue' } });",
  'a hex colour in StyleSheet.create':
    "export const styles = StyleSheet.create({ box: { backgroundColor: '#fff' } });",
  'a named colour in a ViewStyle': "export const box: ViewStyle = { backgroundColor: 'red' };",
  'a named colour in a StyleProp': "export const box: StyleProp<TextStyle> = { color: 'red' };",
  'a named colour that satisfies a style':
    "export const box = { color: 'red' } satisfies TextStyle;",
  'a hex colour outside a style': "export const accent = '#ffffff';",
} as const;

const acceptedStatements = {
  'a typed object that has a colour property': [
    "type Variant = { color: 'primary' | 'danger' };",
    "export const variant: Variant = { color: 'primary' };",
  ].join('\n'),
  'a union typed colour in a props object':
    "export const props = { backgroundColor: 'surface' as const };",
  'a style with tokens': 'export const styles = StyleSheet.create({ box: { color: name } });',
  'typed style values in StyleSheet.create':
    "export const styles = StyleSheet.create({ box: { alignItems: 'center', fontWeight: '700' } });",
} as const;

const elsewhere = {
  'a hex colour in the design tokens': {
    filePath: THEME,
    code: "export const colors = { background: '#ffffff', overlay: 'rgba(0, 0, 0, 0.5)' };",
  },
  'a named colour in the design tokens': {
    filePath: THEME,
    code: "export const colors = { transparentColor: 'transparent' };",
  },
  'a translation key named like a colour property': {
    filePath: RESOURCES,
    code: "export const sample = { settings: { color: 'Couleur', borderColor: 'Bordure' } };",
  },
  'a hex colour outside the UI code': {
    filePath: 'src/infrastructure/http/sample.ts',
    code: "export const accent = '#ffffff';",
  },
  'a text in a title property outside the UI code': {
    filePath: 'src/infrastructure/http/sample.ts',
    code: "export const request = { title: 'Hello', message: 'Hello' };",
  },
} as const;

const stillEnforced = register(
  SCREEN,
  [
    'declare const name: string;',
    'export const load = () => import(name);',
    "export const color = '#ffffff';",
  ].join('\n'),
);

const rejected = registerAll(rejectedJsx, component);
const accepted = registerAll(acceptedJsx, component);
const rejectedOutsideJsx = registerAll(rejectedStatements, sourceFile);
const acceptedOutsideJsx = registerAll(acceptedStatements, sourceFile);
const elsewhereSnippets = Object.entries(elsewhere).map(
  ([name, { filePath, code }]): [string, Snippet] => [name, register(filePath, code)],
);

const routeSnippets = {
  'JSX text': register(ROUTE, component('<Text>Hello</Text>')),
  'a conditional': register(ROUTE, component("<Text>{ok ? 'Yes' : 'No'}</Text>")),
  'an accessibilityLabel': register(ROUTE, component('<View accessibilityLabel="Close" />')),
  'a title in options': register(ROUTE, component("<View options={{ title: 'Home' }} />")),
  'a default text': register(ROUTE, component("<Text>{t('app.name', 'Boardroom')}</Text>")),
  'a translation key': register(ROUTE, component("<Text>{t('app.name')}</Text>")),
};

/** Syntax that domain and application code cannot use: errors are Results, time is a port. */
const rejectedCoreCode = {
  'a throw statement': "export function fail(): never { throw new Error('boom'); }",
  'a throw of a value that is not an Error': "export const fail = () => { throw 'boom'; };",
  'a throw in a method': "export class Sample { run(): void { throw new Error('boom'); } }",
  'a throw in a catch block':
    'export function run(): void { try { run(); } catch (error) { throw error; } }',
  'Date.now()': 'export const now = Date.now();',
  'a reference to Date.now': 'export const read = Date.now;',
  'Date.now() written with a string key': "export const now = Date['now']();",
  'Date.now() behind an optional chain': 'export const now = Date?.now();',
  'new Date() without argument': 'export const now = new Date();',
  'new Date() with a call on it': 'export const millis = new Date().getTime();',
  'Date() called as a function': 'export const text = Date();',
  'performance.now()': 'export const now = performance.now();',
  'a reference to performance.now': 'export const read = performance.now;',
} as const;

const acceptedCoreCode = {
  'new Date with a timestamp': 'export const date = (millis: number) => new Date(millis);',
  'new Date with several arguments': 'export const date = new Date(2030, 0, 1);',
  'Date.UTC': 'export const millis = Date.UTC(2030, 0, 1);',
  'Date.parse': "export const millis = Date.parse('2030-01-01T00:00:00Z');",
  'the now method of a clock': [
    'declare const clock: { now(): number };',
    'export const now = clock.now();',
  ].join('\n'),
  'a property called now': 'export const clock = { now: 1 };',
  'an error returned as a value': 'export const failure = { ok: false, error: { code: 1 } };',
} as const;

/** Imports of test support. */
const rejectedTestingImports = {
  'a relative import': "import { aMeeting } from '../testing/builders';",
  'a relative import of the folder': "import { aMeeting } from '../testing';",
  'a sibling import': "import { aMeeting } from './testing/builders';",
  'an aliased import': "import { aMeeting } from '@domain/testing/builders';",
  'an aliased import of another layer':
    "import { createFakes } from '@application/testing/createFakes';",
  'a type import': "import type { Fakes } from '@application/testing/createFakes';",
  'a default import': "import fakes from '../../testing/fakes';",
  'a side effect import': "import '../testing/setup';",
  'a re-export': "export { aMeeting } from '../testing/builders';",
  'a re-export of everything': "export * from '../testing/builders';",
} as const;

const acceptedTestingImports = {
  'a folder whose name only contains testing': "import { a } from './latesting/builders';",
  'a file whose name starts with testing': "import { a } from './testing-tools';",
  'a path that ends with testing': "import { a } from './protesting';",
  'a regular import': "import { a } from './builders';",
} as const;

const productionFiles = {
  domain: DOMAIN,
  application: APPLICATION,
  presentation: SCREEN,
  infrastructure: INFRASTRUCTURE,
  app: ROUTE,
} as const;

const elsewhereCore = {
  'a throw in a domain test': {
    filePath: DOMAIN_TEST,
    code: "export const fail = () => { throw new Error('boom'); };",
  },
  'a throw in an application test': {
    filePath: APPLICATION_TEST,
    code: "export const fail = () => { throw new Error('boom'); };",
  },
  'Date.now() in a test': { filePath: DOMAIN_TEST, code: 'export const now = Date.now();' },
  'a throw in test support': {
    filePath: TEST_SUPPORT,
    code: "export const fail = () => { throw new Error('boom'); };",
  },
  'new Date() in test support': { filePath: TEST_SUPPORT, code: 'export const now = new Date();' },
  'a throw in the infrastructure': {
    filePath: INFRASTRUCTURE,
    code: "export const fail = () => { throw new Error('boom'); };",
  },
  'Date.now() in the infrastructure': {
    filePath: INFRASTRUCTURE,
    code: 'export const now = Date.now();',
  },
  'a throw in the presentation': {
    filePath: SCREEN,
    code: "export const fail = () => { throw new Error('boom'); };",
  },
  'new Date() in the presentation': { filePath: SCREEN, code: 'export const now = new Date();' },
  'a test importing test support': {
    filePath: DOMAIN_TEST,
    code: "import { aMeeting } from '../testing/builders';\nexport const meeting = aMeeting;",
  },
  'a presentation test importing test support': {
    filePath: 'src/presentation/screens/Sample.test.tsx',
    code: "import { setDeviceLanguages } from '../i18n/testing/setDeviceLanguages';\nexport const set = setDeviceLanguages;",
  },
  'test support importing test support': {
    filePath: TEST_SUPPORT,
    code: "import { aMeeting } from '@domain/testing/builders';\nimport { FakeClock } from './FakeClock';\nexport const both = [aMeeting, FakeClock];",
  },
  'test support in a folder importing from its parent': {
    filePath: 'src/domain/testing/builders.ts',
    code: "import { createFakes } from '../../application/testing/createFakes';\nexport const fakes = createFakes;",
  },
  'a tooling file importing test support': {
    filePath: 'tooling/sample.ts',
    code: "import { aMeeting } from '../src/domain/testing/builders';\nexport const meeting = aMeeting;",
  },
} as const;

const asWritten = (code: string): string => code;

const rejectedCore = {
  domain: registerAll(rejectedCoreCode, asWritten, DOMAIN),
  application: registerAll(rejectedCoreCode, asWritten, APPLICATION),
};
const acceptedCore = {
  domain: registerAll(acceptedCoreCode, asWritten, DOMAIN),
  application: registerAll(acceptedCoreCode, asWritten, APPLICATION),
};

/** The rules that every set of files keeps, whatever else was added for it. */
const keptEverywhere = Object.entries({
  'domain code': DOMAIN,
  'application code': APPLICATION,
  'presentation code': SCREEN,
  'a route': ROUTE,
  'the design tokens': THEME,
  'the translation resources': RESOURCES,
  'production code in a testing folder': 'src/application/testing/FakeSample.ts',
  'a domain test': DOMAIN_TEST,
}).map(
  ([name, filePath]) =>
    [
      name,
      register(filePath, 'declare const name: string;\nexport const load = () => import(name);'),
    ] as const,
);

const rejectedTesting = Object.fromEntries(
  Object.entries(productionFiles).map(([where, filePath]) => [
    where,
    registerAll(rejectedTestingImports, asWritten, filePath),
  ]),
);
const acceptedTesting = Object.fromEntries(
  Object.entries(productionFiles).map(([where, filePath]) => [
    where,
    registerAll(acceptedTestingImports, asWritten, filePath),
  ]),
);
const elsewhereCoreSnippets = Object.entries(elsewhereCore).map(
  ([name, { filePath, code }]): [string, Snippet] => [name, register(filePath, code)],
);
const nodeModulesImport = register(
  DOMAIN,
  "import { sample } from '../../node_modules/some-package/index';\nexport const value = sample;",
);
const throwAndClock = register(
  DOMAIN,
  [
    "export function fail(): never { throw new Error('boom'); }",
    'export const now = Date.now();',
  ].join('\n'),
);

/** Imports of the two packages that hold state, which only the presentation layer may use. */
const stateLibraryImports = {
  'TanStack Query':
    "import { useQuery } from '@tanstack/react-query';\nexport const hook = useQuery;",
  'a type of TanStack Query':
    "import type { QueryClient } from '@tanstack/react-query';\nexport type Client = QueryClient;",
  Zustand: "import { createStore } from 'zustand';\nexport const make = createStore;",
  'a subpath of Zustand':
    "import { createStore } from 'zustand/vanilla';\nexport const make = createStore;",
  'a type of Zustand':
    "import type { StoreApi } from 'zustand';\nexport type Api = StoreApi<unknown>;",
} as const;

const stateLibraryFiles = {
  'domain code': DOMAIN,
  'application code': APPLICATION,
  'infrastructure code': INFRASTRUCTURE,
  'the composition root': DI,
  'a route': ROUTE,
} as const;

const rejectedStateLibraries = Object.fromEntries(
  Object.entries(stateLibraryFiles).map(([where, filePath]) => [
    where,
    registerAll(stateLibraryImports, asWritten, filePath),
  ]),
);
const presentationFiles = {
  'a screen': SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
} as const;

const acceptedStateLibraries = Object.fromEntries(
  Object.entries(presentationFiles).map(([where, filePath]) => [
    where,
    registerAll(stateLibraryImports, asWritten, filePath),
  ]),
);

/** Imports of the native modules of the device, which only the infrastructure layer may make. */
const deviceImports = {
  'expo-sqlite':
    "import * as SQLite from 'expo-sqlite';\nexport const open = SQLite.openDatabaseAsync;",
  'a subpath of expo-sqlite':
    "import Storage from 'expo-sqlite/kv-store';\nexport const storage = Storage;",
  'expo-secure-store':
    "import * as SecureStore from 'expo-secure-store';\nexport const get = SecureStore.getItemAsync;",
  'expo-local-authentication':
    "import * as Auth from 'expo-local-authentication';\nexport const ask = Auth.authenticateAsync;",
  'expo-network':
    "import * as Network from 'expo-network';\nexport const state = Network.getNetworkStateAsync;",
  'a type of expo-network':
    "import type { NetworkState } from 'expo-network';\nexport type State = NetworkState;",
  'a named import of expo-secure-store':
    "import { getItemAsync } from 'expo-secure-store';\nexport const get = getItemAsync;",
  'expo-crypto':
    "import * as Crypto from 'expo-crypto';\nexport const bytes = Crypto.getRandomBytesAsync;",
  'a named import of expo-crypto':
    "import { getRandomBytesAsync } from 'expo-crypto';\nexport const bytes = getRandomBytesAsync;",
  'a subpath of expo-crypto':
    "import { digest } from 'expo-crypto/build/Crypto';\nexport const hash = digest;",
  'a type of expo-crypto':
    "import type { CryptoDigestAlgorithm } from 'expo-crypto';\nexport type Algorithm = CryptoDigestAlgorithm;",
  'expo-file-system':
    "import { File } from 'expo-file-system';\nexport const open = (name: string) => new File(name);",
  'a subpath of expo-file-system':
    "import * as Legacy from 'expo-file-system/legacy';\nexport const read = Legacy.readAsStringAsync;",
  'a type of expo-file-system':
    "import type { FileInfo } from 'expo-file-system';\nexport type Info = FileInfo;",
  'expo-updates':
    "import * as Updates from 'expo-updates';\nexport const check = Updates.checkForUpdateAsync;",
  'a subpath of expo-updates':
    "import { reloadAsync } from 'expo-updates/build/Updates';\nexport const reload = reloadAsync;",
} as const;

const deviceFiles = {
  'domain code': DOMAIN,
  'application code': APPLICATION,
  'the composition root': DI,
  'a route': ROUTE,
  'a screen': SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
} as const;

const rejectedDevicePackages = Object.fromEntries(
  Object.entries(deviceFiles).map(([where, filePath]) => [
    where,
    registerAll(deviceImports, asWritten, filePath),
  ]),
);
const infrastructureFiles = {
  'an HTTP adapter': INFRASTRUCTURE,
  'a persistence adapter': PERSISTENCE,
} as const;
const acceptedDevicePackages = Object.fromEntries(
  Object.entries(infrastructureFiles).map(([where, filePath]) => [
    where,
    registerAll(deviceImports, asWritten, filePath),
  ]),
);

const NATIVE_ADAPTER = 'src/infrastructure/native/Sample.ts';
const NATIVE_ADAPTER_TEST = 'src/infrastructure/native/Sample.test.ts';

/**
 * Imports of the local native module ScreenProtection, written as they would be from `filePath`:
 * by the relative path (the only way to import it), to its entry point and to a file in it.
 */
function nativeModuleImports(filePath: string): Record<string, string> {
  const to = path.posix.relative(path.posix.dirname(filePath), 'modules/screen-protection');
  return {
    'the entry point of the native module': `import ScreenProtection from '${to}';\nexport const module = ScreenProtection;`,
    'a type of the native module': `import type { ScreenProtectionModule } from '${to}';\nexport type Module = ScreenProtectionModule;`,
    'a file inside the native module': `import ScreenProtection from '${to}/src/ScreenProtectionModule';\nexport const module = ScreenProtection;`,
  };
}

const nativeModuleRejectedFiles = {
  'domain code': DOMAIN,
  'application code': APPLICATION,
  'test support of the application': TEST_SUPPORT,
  'the composition root': DI,
  'a route': ROUTE,
  'a screen': SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
  'an HTTP adapter': INFRASTRUCTURE,
  'a persistence adapter': PERSISTENCE,
  'a test of the infrastructure': INFRASTRUCTURE_TEST,
  'test support of the infrastructure': INFRASTRUCTURE_TEST_SUPPORT,
} as const;

/** The one component of the presentation that may import the secure view of the native module. */
const SECURE_CONTENT = 'src/presentation/components/SecureContent.tsx';
const OTHER_COMPONENT = 'src/presentation/components/Sample.tsx';

/** The import of the secure view only, by the entry point of the native module. */
function secureViewImport(filePath: string): Record<string, string> {
  const to = path.posix.relative(path.posix.dirname(filePath), 'modules/screen-protection');
  return {
    'the secure view of the native module': `import { ScreenProtectionSecureView } from '${to}';\nexport const View = ScreenProtectionSecureView;`,
    'the type of the props of the secure view': `import type { ScreenProtectionSecureViewProps } from '${to}';\nexport type Props = ScreenProtectionSecureViewProps;`,
  };
}

const nativeModuleAcceptedFiles = {
  'the native adapter': NATIVE_ADAPTER,
  'a test of the native adapter': NATIVE_ADAPTER_TEST,
} as const;

const rejectedNativeModule = Object.fromEntries(
  Object.entries(nativeModuleRejectedFiles).map(([where, filePath]) => [
    where,
    registerAll(nativeModuleImports(filePath), asWritten, filePath),
  ]),
);
const acceptedNativeModule = Object.fromEntries(
  Object.entries(nativeModuleAcceptedFiles).map(([where, filePath]) => [
    where,
    registerAll(nativeModuleImports(filePath), asWritten, filePath),
  ]),
);

/** What `SecureContent` may not import of the native module: all but its secure view. */
const rejectedInSecureContent = registerAll(
  nativeModuleImports(SECURE_CONTENT),
  asWritten,
  SECURE_CONTENT,
);
const acceptedInSecureContent = registerAll(
  secureViewImport(SECURE_CONTENT),
  asWritten,
  SECURE_CONTENT,
);
/** The secure view, imported anywhere else in the presentation: still rejected. */
const rejectedSecureViewElsewhere = Object.fromEntries(
  Object.entries({
    'another component': OTHER_COMPONENT,
    'a screen': SCREEN,
    'a hook of the presentation': PRESENTATION_HOOK,
    'a route': ROUTE,
    'a test of SecureContent': 'src/presentation/components/SecureContent.test.tsx',
  }).map(([where, filePath]) => [
    where,
    registerAll(secureViewImport(filePath), asWritten, filePath),
  ]),
);

/** `fetch`, which a module of the infrastructure layer alone may call. */
const fetchCalls = {
  'a call of fetch': "export const load = () => fetch('https://example.com');",
  'a reference to fetch': 'export const send = fetch;',
} as const;

const fetchMembers = {
  'globalThis.fetch': "export const load = () => globalThis.fetch('https://example.com');",
  'global.fetch': "export const load = () => global.fetch('https://example.com');",
  'window.fetch': "export const load = () => window.fetch('https://example.com');",
  'self.fetch': "export const load = () => self.fetch('https://example.com');",
} as const;

const fetchRejectedFiles = {
  domain: DOMAIN,
  application: APPLICATION,
  'test support of the application': TEST_SUPPORT,
  presentation: SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
  'the composition root': DI,
  app: ROUTE,
  'an adapter other than the HTTP client': INFRASTRUCTURE,
  'a persistence adapter': PERSISTENCE,
} as const;

const rejectedFetch = Object.fromEntries(
  Object.entries(fetchRejectedFiles).map(([where, filePath]) => [
    where,
    registerAll(fetchCalls, asWritten, filePath),
  ]),
);
const acceptedFetch = {
  'the HTTP client': registerAll(fetchCalls, asWritten, HTTP_CLIENT),
  'a test of the infrastructure': registerAll(fetchCalls, asWritten, INFRASTRUCTURE_TEST),
  'test support of the infrastructure': registerAll(
    fetchCalls,
    asWritten,
    INFRASTRUCTURE_TEST_SUPPORT,
  ),
};
const rejectedFetchMembers = Object.fromEntries(
  Object.entries({
    ...fetchRejectedFiles,
    'the HTTP client': HTTP_CLIENT,
    'a test of the infrastructure': INFRASTRUCTURE_TEST,
  }).map(([where, filePath]) => [where, registerAll(fetchMembers, asWritten, filePath)]),
);

/** The files that are the one importer of a package (see `FILE_SYSTEM_FILE` and `PDF_VIEWER_FILE`). */
const FILE_SYSTEM_VOLUME = 'src/infrastructure/files/ExpoFileVolume.ts';
const PDF_VIEWER = 'src/presentation/components/PdfViewer.tsx';

const fileSystemImports = {
  'expo-file-system':
    "import { Directory, File } from 'expo-file-system';\nexport const open = [Directory, File];",
  'a subpath of expo-file-system':
    "import * as Legacy from 'expo-file-system/legacy';\nexport const read = Legacy.readAsStringAsync;",
  'a type of expo-file-system':
    "import type { FileInfo } from 'expo-file-system';\nexport type Info = FileInfo;",
} as const;

const pdfImports = {
  'react-native-pdf': "import Pdf from 'react-native-pdf';\nexport const View = Pdf;",
  'a type of react-native-pdf':
    "import type { PdfProps } from 'react-native-pdf';\nexport type Props = PdfProps;",
  'a file of react-native-pdf':
    "import PdfView from 'react-native-pdf/PdfView';\nexport const View = PdfView;",
} as const;

const fileSystemRejectedFiles = {
  'an adapter of the files that is not the volume': 'src/infrastructure/files/FileStore.ts',
  'an HTTP adapter': INFRASTRUCTURE,
  'a persistence adapter': PERSISTENCE,
  'a test of the infrastructure': INFRASTRUCTURE_TEST,
  'test support of the infrastructure': INFRASTRUCTURE_TEST_SUPPORT,
} as const;
const rejectedFileSystem = Object.fromEntries(
  Object.entries(fileSystemRejectedFiles).map(([where, filePath]) => [
    where,
    registerAll(fileSystemImports, asWritten, filePath),
  ]),
);
const acceptedFileSystem = registerAll(fileSystemImports, asWritten, FILE_SYSTEM_VOLUME);

const pdfRejectedFiles = {
  'another component of the presentation': 'src/presentation/components/Sample.tsx',
  'a screen': SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
  'test support of the presentation': 'src/presentation/testing/sample.tsx',
  'a test of the presentation': 'src/presentation/components/PdfViewer.test.tsx',
  'a route': ROUTE,
  'an adapter': INFRASTRUCTURE,
} as const;
const rejectedPdf = Object.fromEntries(
  Object.entries(pdfRejectedFiles).map(([where, filePath]) => [
    where,
    registerAll(pdfImports, asWritten, filePath),
  ]),
);
const acceptedPdf = registerAll(pdfImports, asWritten, PDF_VIEWER);

const SENTRY_ADAPTER = 'src/infrastructure/monitoring/SentryMonitoring.ts';

const sentryImports = {
  '@sentry/react-native':
    "import * as Sentry from '@sentry/react-native';\nexport const start = Sentry.init;",
  'a named import of @sentry/react-native':
    "import { captureException } from '@sentry/react-native';\nexport const capture = captureException;",
  'a type of @sentry/react-native':
    "import type { Breadcrumb } from '@sentry/react-native';\nexport type Trail = Breadcrumb;",
  'a subpath of @sentry/react-native':
    "import { getSentryExpoConfig } from '@sentry/react-native/metro';\nexport const config = getSentryExpoConfig;",
  'another package of Sentry':
    "import { captureException } from '@sentry/core';\nexport const capture = captureException;",
} as const;

const sentryRejectedFiles = {
  'domain code': DOMAIN,
  'application code': APPLICATION,
  'the composition root': DI,
  'a route': ROUTE,
  'a screen': SCREEN,
  'a hook of the presentation': PRESENTATION_HOOK,
  'the console monitoring': 'src/infrastructure/monitoring/ConsoleMonitoring.ts',
  'an HTTP adapter': INFRASTRUCTURE,
  'a test of the Sentry adapter': 'src/infrastructure/monitoring/SentryMonitoring.test.ts',
  'test support of the infrastructure': INFRASTRUCTURE_TEST_SUPPORT,
} as const;
const rejectedSentry = Object.fromEntries(
  Object.entries(sentryRejectedFiles).map(([where, filePath]) => [
    where,
    registerAll(sentryImports, asWritten, filePath),
  ]),
);
const acceptedSentry = registerAll(sentryImports, asWritten, SENTRY_ADAPTER);

/** The volume may not import the viewer's package, nor the viewer the volume's: each is exempt once. */
const crossedImports = {
  'react-native-pdf from the volume': registerAll(pdfImports, asWritten, FILE_SYSTEM_VOLUME),
  'expo-file-system from the viewer': registerAll(fileSystemImports, asWritten, PDF_VIEWER),
  'react-native-pdf from the adapter of Sentry': registerAll(pdfImports, asWritten, SENTRY_ADAPTER),
  '@sentry/react-native from the viewer': registerAll(sentryImports, asWritten, PDF_VIEWER),
};

/** The exempt files are exempt from one pattern, and keep the others. */
const exemptFilesKeepTheirOtherRules: [string, Snippet][] = [
  [
    'the volume of the device',
    register(
      FILE_SYSTEM_VOLUME,
      "import { aStore } from '../testing/NodeFileVolume';\nexport const store = aStore;",
    ),
  ],
  [
    'the PDF viewer',
    register(
      PDF_VIEWER,
      "import { renderScreen } from '../testing/renderScreen';\nexport const render = renderScreen;",
    ),
  ],
  [
    'the adapter of Sentry',
    register(
      SENTRY_ADAPTER,
      "import { aStore } from '../testing/NodeFileVolume';\nexport const store = aStore;",
    ),
  ],
];

let findings: Finding[][] = [];

beforeAll(() => {
  const run = spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify(snippets),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error(`lint-snippets.mjs failed:\n${run.stderr}`);
  findings = (JSON.parse(run.stdout) as { messages: Finding[] }[]).map(({ messages }) => messages);
}, 120_000);

/** What the convention rules report for a snippet, after checking that it parsed. */
function reported(snippet: Snippet): Finding[] {
  const messages = findings[snippets.indexOf(snippet)] ?? [];
  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);
  return messages.filter(
    (message) => message.ruleId !== null && CONVENTION_RULES.has(message.ruleId),
  );
}

/** What the rule on the ambient globals reports for a snippet, after checking that it parsed. */
function reportedGlobals(snippet: Snippet): Finding[] {
  const messages = findings[snippets.indexOf(snippet)] ?? [];
  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);
  return messages.filter((message) => message.ruleId !== null && GLOBAL_RULES.has(message.ruleId));
}

/** What the dependency policies report for a snippet, after checking that it parsed. */
function reportedBoundaries(snippet: Snippet): Finding[] {
  const messages = findings[snippets.indexOf(snippet)] ?? [];
  expect(messages.filter((message) => message.ruleId === null)).toEqual([]);
  return messages.filter(
    (message) => message.ruleId !== null && BOUNDARY_RULES.has(message.ruleId),
  );
}

/** The snippet registered under `name`. */
function named(cases: [string, Snippet][], name: string): Snippet {
  const found = cases.find(([caseName]) => caseName === name);
  if (found === undefined) throw new Error(`No snippet named "${name}".`);
  return found[1];
}

describe('UI code lint rules', () => {
  describe('in src/presentation', () => {
    it.each(rejected)('rejects %s', (_name, snippet) => {
      expect(reported(snippet).length).toBeGreaterThan(0);
    });

    it.each(accepted)('accepts %s', (_name, snippet) => {
      expect(reported(snippet)).toEqual([]);
    });

    it.each(rejectedOutsideJsx)('rejects %s', (_name, snippet) => {
      expect(reported(snippet).length).toBeGreaterThan(0);
    });

    it.each(acceptedOutsideJsx)('accepts %s', (_name, snippet) => {
      expect(reported(snippet)).toEqual([]);
    });

    it('reports each hardcoded branch of a conditional once', () => {
      expect(reported(named(rejected, 'a conditional'))).toHaveLength(2);
      expect(reported(named(rejected, 'a conditional in a type assertion'))).toHaveLength(2);
    });

    it('reports a text nested deep in conditionals once', () => {
      expect(reported(named(rejected, 'a conditional nested five deep'))).toHaveLength(1);
    });

    it('reports a raw colour once', () => {
      expect(reported(named(rejected, 'a hex colour'))).toHaveLength(1);
      expect(reported(named(rejected, 'a named colour'))).toHaveLength(1);
      expect(reported(named(rejectedOutsideJsx, 'a hex colour in StyleSheet.create'))).toHaveLength(
        1,
      );
    });

    it('reports the value of a property, not its key, when the key is a string', () => {
      expect(reported(named(rejected, 'a title in options, as a quoted key'))).toHaveLength(1);
      expect(reported(named(rejected, 'a title in options, as a computed key'))).toHaveLength(1);
      expect(reported(named(rejected, 'a named colour as a quoted key'))).toHaveLength(1);
      expect(reported(named(rejected, 'a named colour as a computed key'))).toHaveLength(1);
    });

    it('reports a default text once', () => {
      expect(reported(named(rejected, 'a default text'))).toHaveLength(1);
      expect(reported(named(rejected, 'a default text in the options'))).toHaveLength(1);
    });

    it('still rejects a module specifier computed at runtime', () => {
      const messages = reported(stillEnforced).map(({ message }) => message);

      expect(messages).toContainEqual(
        expect.stringContaining('string literal as module specifier'),
      );
      expect(messages).toContainEqual(expect.stringContaining('Raw colour'));
    });
  });

  describe('in app/', () => {
    it.each([
      'JSX text',
      'a conditional',
      'an accessibilityLabel',
      'a title in options',
      'a default text',
    ] as const)('rejects %s', (name) => {
      expect(reported(routeSnippets[name]).length).toBeGreaterThan(0);
    });

    it('accepts a translation key', () => {
      expect(reported(routeSnippets['a translation key'])).toEqual([]);
    });
  });

  describe('where the rules do not apply', () => {
    it.each(elsewhereSnippets)('accepts %s', (_name, snippet) => {
      expect(reported(snippet)).toEqual([]);
    });
  });
});

describe('Domain, application and test support lint rules', () => {
  describe('in domain and application code', () => {
    describe.each(Object.entries(rejectedCore))('in src/%s', (_layer, cases) => {
      it.each(cases)('rejects %s', (_name, snippet) => {
        expect(reported(snippet).length).toBeGreaterThan(0);
      });
    });

    describe.each(Object.entries(acceptedCore))('in src/%s', (_layer, cases) => {
      it.each(cases)('accepts %s', (_name, snippet) => {
        expect(reported(snippet)).toEqual([]);
      });
    });

    it('explains how to fail without throwing', () => {
      const cases = rejectedCore.domain;

      expect(reported(named(cases, 'a throw statement')).map(({ message }) => message)).toEqual([
        expect.stringContaining('return an error Result'),
      ]);
    });

    it('explains where the time comes from', () => {
      const cases = rejectedCore.domain;

      expect(reported(named(cases, 'Date.now()')).map(({ message }) => message)).toEqual([
        expect.stringContaining('Clock port'),
      ]);
    });

    it('reports each forbidden construct once', () => {
      const cases = rejectedCore.domain;

      expect(reported(named(cases, 'a throw statement'))).toHaveLength(1);
      expect(reported(named(cases, 'Date.now()'))).toHaveLength(1);
      expect(reported(named(cases, 'new Date() without argument'))).toHaveLength(1);
      expect(reported(named(cases, 'performance.now()'))).toHaveLength(1);
      expect(reported(throwAndClock)).toHaveLength(2);
    });
  });

  describe('where the rules do not apply', () => {
    it.each(elsewhereCoreSnippets)('accepts %s', (_name, snippet) => {
      expect(reported(snippet)).toEqual([]);
    });
  });

  describe('the restrictions that apply to every set of files', () => {
    it.each(keptEverywhere)(
      'still rejects a module specifier computed at runtime in %s',
      (_name, snippet) => {
        expect(reported(snippet).map(({ message }) => message)).toContainEqual(
          expect.stringContaining('string literal as module specifier'),
        );
      },
    );
  });

  describe('imports of test support', () => {
    describe.each(Object.entries(rejectedTesting))('in production code of %s', (_where, cases) => {
      it.each(cases)('rejects %s', (_name, snippet) => {
        const messages = reported(snippet).map(({ message }) => message);

        expect(messages).toEqual([expect.stringContaining('Only tests and other test support')]);
      });
    });

    describe.each(Object.entries(acceptedTesting))('in production code of %s', (_where, cases) => {
      it.each(cases)('accepts %s', (_name, snippet) => {
        expect(reported(snippet)).toEqual([]);
      });
    });

    it('still rejects a path inside node_modules', () => {
      expect(reported(nodeModulesImport)).toEqual([
        expect.objectContaining({
          message: expect.stringContaining('not by a path inside node_modules'),
        }),
      ]);
    });
  });
});

describe('State libraries lint rules', () => {
  describe.each(Object.entries(rejectedStateLibraries))('in %s', (_where, cases) => {
    it.each(cases)('rejects the import of %s', (_name, snippet) => {
      const messages = reportedBoundaries(snippet).map(({ message }) => message);

      expect(messages).toContainEqual(
        expect.stringContaining('only be imported from src/presentation'),
      );
    });
  });

  describe.each(Object.entries(acceptedStateLibraries))('in %s', (_where, cases) => {
    it.each(cases)('accepts the import of %s', (_name, snippet) => {
      expect(reportedBoundaries(snippet)).toEqual([]);
    });
  });
});

describe('Native modules of the device lint rules', () => {
  describe.each(Object.entries(rejectedDevicePackages))('in %s', (_where, cases) => {
    it.each(cases)('rejects the import of %s', (_name, snippet) => {
      const messages = reportedBoundaries(snippet).map(({ message }) => message);

      expect(messages).toContainEqual(
        expect.stringContaining('only be imported from src/infrastructure'),
      );
    });
  });

  describe.each(Object.entries(acceptedDevicePackages))('in %s', (_where, cases) => {
    it.each(cases)('accepts the import of %s', (_name, snippet) => {
      expect(reportedBoundaries(snippet)).toEqual([]);
    });
  });
});

describe('The native module ScreenProtection lint rules', () => {
  const NATIVE_MODULE_MESSAGE = 'may only be imported from src/infrastructure/native';

  /** The findings of both rules that guard it: the dependency policies and the restricted imports. */
  const guarded = (snippet: Snippet): Finding[] => [
    ...reportedBoundaries(snippet),
    ...reported(snippet),
  ];

  describe.each(Object.entries(rejectedNativeModule))('in %s', (_where, cases) => {
    it.each(cases)(
      'rejects the import of %s, and says where it may be imported',
      (_name, snippet) => {
        expect(guarded(snippet).map(({ message }) => message)).toContainEqual(
          expect.stringContaining(NATIVE_MODULE_MESSAGE),
        );
      },
    );
  });

  describe.each(Object.entries(acceptedNativeModule))('in %s', (_where, cases) => {
    it.each(cases)('accepts the import of %s', (_name, snippet) => {
      expect(guarded(snippet)).toEqual([]);
    });
  });

  // The one exception: the component that mounts the secure view (a native view cannot cross the
  // ScreenProtection port). It may import the secure view from the entry point, and nothing else.
  describe('the exception for the secure view, in SecureContent', () => {
    it.each(acceptedInSecureContent)('accepts the import of %s', (_name, snippet) => {
      expect(guarded(snippet)).toEqual([]);
    });

    it.each(rejectedInSecureContent)(
      'still rejects the import of %s, and says what it may import',
      (_name, snippet) => {
        expect(guarded(snippet).map(({ message }) => message)).toContainEqual(
          expect.stringMatching(/may import the secure view|never a file inside it/),
        );
      },
    );
  });

  describe.each(Object.entries(rejectedSecureViewElsewhere))(
    'the secure view, in %s',
    (_where, cases) => {
      it.each(cases)('rejects the import of %s', (_name, snippet) => {
        expect(guarded(snippet).map(({ message }) => message)).toContainEqual(
          expect.stringContaining(NATIVE_MODULE_MESSAGE),
        );
      });
    },
  );
});

describe('The fetch lint rules', () => {
  describe.each(Object.entries(rejectedFetch))('in %s', (_where, cases) => {
    it.each(cases)('rejects %s', (_name, snippet) => {
      expect(reportedGlobals(snippet).length).toBeGreaterThan(0);
    });
  });

  describe.each(Object.entries(acceptedFetch))('in %s', (_where, cases) => {
    it.each(cases)('accepts %s', (_name, snippet) => {
      expect(reportedGlobals(snippet)).toEqual([]);
      expect(reported(snippet)).toEqual([]);
    });
  });

  it('names the one module that may call it', () => {
    const snippet = named(
      rejectedFetch['an adapter other than the HTTP client'] ?? [],
      'a call of fetch',
    );

    expect(reportedGlobals(snippet).map(({ message }) => message)).toEqual([
      expect.stringContaining('src/infrastructure/http/HttpClient.ts'),
    ]);
  });

  describe.each(Object.entries(rejectedFetchMembers))(
    'through a global object, in %s',
    (_where, cases) => {
      it.each(cases)('rejects %s', (_name, snippet) => {
        expect(reported(snippet).map(({ message }) => message)).toContainEqual(
          expect.stringContaining('src/infrastructure/http/HttpClient.ts'),
        );
      });
    },
  );
});

describe('The packages that one file alone may import', () => {
  describe.each(Object.entries(rejectedFileSystem))('expo-file-system, in %s', (_where, cases) => {
    it.each(cases)('rejects the import of %s', (_name, snippet) => {
      expect(reported(snippet).map(({ message }) => message)).toContainEqual(
        expect.stringContaining(`only be imported from ${FILE_SYSTEM_VOLUME}`),
      );
    });
  });

  it.each(acceptedFileSystem)(
    'accepts the import of %s in the volume of the device',
    (_name, snippet) => {
      expect(reported(snippet)).toEqual([]);
    },
  );

  describe.each(Object.entries(rejectedPdf))('react-native-pdf, in %s', (_where, cases) => {
    it.each(cases)('rejects the import of %s', (_name, snippet) => {
      expect(reported(snippet).map(({ message }) => message)).toContainEqual(
        expect.stringContaining(`only be imported from ${PDF_VIEWER}`),
      );
    });
  });

  it.each(acceptedPdf)('accepts the import of %s in the PDF viewer', (_name, snippet) => {
    expect(reported(snippet)).toEqual([]);
  });

  describe.each(Object.entries(rejectedSentry))('@sentry, in %s', (_where, cases) => {
    it.each(cases)('rejects the import of %s, and names the adapter', (_name, snippet) => {
      const messages = [...reportedBoundaries(snippet), ...reported(snippet)].map(
        ({ message }) => message,
      );

      expect(messages).toContainEqual(
        expect.stringContaining(`only be imported from ${SENTRY_ADAPTER}`),
      );
    });
  });

  it.each(acceptedSentry)('accepts the import of %s in the adapter of Sentry', (_name, snippet) => {
    expect([...reportedBoundaries(snippet), ...reported(snippet)]).toEqual([]);
  });

  describe.each(Object.entries(crossedImports))('%s', (_where, cases) => {
    it.each(cases)('rejects the import of %s', (_name, snippet) => {
      expect(reported(snippet)).not.toEqual([]);
    });
  });

  it.each(exemptFilesKeepTheirOtherRules)(
    'still rejects the import of test support in %s, which is exempt from one package only',
    (_where, snippet) => {
      expect(reported(snippet).map(({ message }) => message)).toEqual([
        expect.stringContaining('Only tests and other test support'),
      ]);
    },
  );
});
