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
