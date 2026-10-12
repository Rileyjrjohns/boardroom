# Boardroom

Boardroom is a React Native demo app for board-of-directors governance. It exists to showcase a strict hexagonal (ports and adapters) architecture and production-grade tooling on a mobile codebase: the dependency rule between layers is not a convention, it is enforced by the linter.

> **Status:** scaffold, tooling and internationalisation foundation only. There is no business code and no feature UI yet, only a placeholder screen that proves the whole pipeline (routing, aliases, translations, lint, types, tests, hooks) works end to end.

## Tech stack

| Area          | Choice                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime       | Expo SDK 57, React Native 0.86, React 19 (New Architecture, always on from SDK 55)                                                         |
| Navigation    | expo-router (file-based, typed routes), custom scheme `boardroom`                                                                          |
| Native builds | expo-dev-client with Continuous Native Generation (`ios/` and `android/` are git-ignored)                                                  |
| i18n          | i18next, react-i18next, expo-localization: English and French, English as the fallback, typed keys (see Internationalisation)              |
| Language      | TypeScript, strict, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`; the JS config files are type-checked too (`checkJs`) |
| Lint          | ESLint 9 flat config, eslint-config-expo, eslint-plugin-boundaries, eslint-config-prettier, no-magic-string rules for the UI code          |
| Formatting    | Prettier                                                                                                                                   |
| Tests         | Jest 29 with four projects (`core`, `infra`, `ui`, `tooling`), jest-expo, React Native Testing Library                                     |
| Git hooks     | Husky, lint-staged, a Conventional Commits check written in plain shell                                                                    |

## Getting started

Prerequisites:

- Node.js 24 (see `.nvmrc`) and npm 11.
- For running the app: Xcode (iOS) and/or Android Studio with an emulator (Android).

```sh
nvm use          # picks the Node version from .nvmrc
npm install      # installs dependencies and the git hooks (through the "prepare" script)
npm run validate # lint, typecheck, format check and tests
```

Run the app. The project uses a development client, so Expo Go is not used:

```sh
npm run ios      # generates ios/ if needed, builds the dev client, installs and launches it
npm run android  # same for Android
npm start        # starts Metro for an already installed dev client
```

`ios/` and `android/` are produced from `app.config.ts` by Continuous Native Generation and are never committed. Native configuration lives in `app.config.ts` and in config plugins, never in the generated folders.

The Git hooks are installed by the `prepare` script, and only when `npm install` runs inside a Git repository. Husky skips the installation without failing when `.git` does not exist yet, so after a `git init` that comes later, run `npm run prepare` once and check that `git config core.hooksPath` prints `.husky/_`.

### Typed routes

`experiments.typedRoutes` is on, but expo-router writes the route types (`.expo/types/router.d.ts`, git-ignored) only while the dev server runs. On a fresh clone, and in CI, `npm run typecheck` does not check `href` values until `npm start` has run once: a misspelled route still compiles. Start the dev server once after cloning, and after adding a route, to get the check locally. Gating routes in CI needs a step that starts Metro briefly before `tsc`; that belongs to the CI/CD step.

### Placeholders in the native configuration

These values are deliberate placeholders, to be replaced before any store submission:

- The bundle identifier and Android package are `com.boardroom.demo`.
- `assets/` holds the images of the Expo template, and `android.adaptiveIcon.backgroundColor` is the template colour. They await the Boardroom brand artwork.
- No splash screen is configured, because `expo-splash-screen` is not a dependency of the project. The generated native projects keep the Expo template defaults: on iOS the launch storyboard references a launch image that is not generated, so the launch screen is blank, and Android shows the template logo. Configuring a real splash screen means adding `expo-splash-screen` (`npx expo install expo-splash-screen`) and its config plugin with an image and a background colour.
- The light appearance is locked on iOS only (`ios.userInterfaceStyle`). Locking it on Android as well needs `expo-system-ui`.

Android is hardened for confidential material: backups are off (`android.allowBackup: false`) and the storage and vibration permissions that the Expo template adds are blocked (`android.blockedPermissions`). `SYSTEM_ALERT_WINDOW` is kept because the development client overlays rely on it; revisit it together with the release build configuration.

### About `.npmrc`

The repository sets `legacy-peer-deps=true`. expo-router's dependency tree declares non-optional peers (`react-dom`, `react-native-reanimated`, and others) that are only useful for web, drawers and animations. Without this setting npm installs them automatically, and `react-dom` resolves to a version that conflicts with the React version pinned by the SDK. With it, only the peers that expo-router strictly requires are installed, and they are declared explicitly in `package.json`.

A consequence: `npm ls --all` exits with an error. It reports `react-dom`, `react-native-gesture-handler` and `react-native-reanimated` as missing, required by dependencies of expo-router (`@radix-ui/*`, `vaul`, `react-native-drawer-layout`). That is expected. Those packages are only reached from web builds and from `expo-router/drawer`, and neither is supported here. Do not add a CI step that requires `npm ls --all` to be clean (plain `npm ls` is clean).

### Peers of the test tooling

- `@react-native/jest-preset` is declared in `devDependencies` on purpose. `jest-expo` 57 requires it as a peer, and `legacy-peer-deps` stops npm from installing peers by itself.
- `react-test-renderer`, a peer of `@testing-library/react-native`, is not declared. npm installs it as a dependency of `jest-expo`, at the version the SDK expects. Declaring it explicitly is an open decision for the repository owner.

### Dependencies of the internationalisation

- `i18next` and `react-i18next` are regular dependencies. `react-i18next` needs `i18next` and `react` as peers, which are declared, and `typescript` as an optional peer, which is a development dependency already.
- `expo-localization` was added with `npx expo install`, so that its version matches the SDK. It provides the device language and a config plugin (see Internationalisation).
- `intl-pluralrules`, the usual polyfill for `Intl.PluralRules` on Hermes, is deliberately not a dependency: see "Plurals on Hermes" below.

## npm scripts

| Script                  | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `npm start`             | Starts Metro for the development client                                                |
| `npm run ios`           | Builds and runs the iOS development client                                             |
| `npm run android`       | Builds and runs the Android development client                                         |
| `npm run lint`          | ESLint over the whole repository, zero warnings allowed                                |
| `npm run lint:fix`      | ESLint with autofix                                                                    |
| `npm run typecheck`     | `tsc --noEmit`, which also checks the JS config files at the repository root           |
| `npm test`              | Runs every Jest project, without the coverage gate                                     |
| `npm run test:coverage` | Runs Jest with coverage and enforces the 90 percent gate on `domain` and `application` |
| `npm run format`        | Prettier, write mode                                                                   |
| `npm run format:check`  | Prettier, check mode                                                                   |
| `npm run validate`      | `lint`, `typecheck`, `format:check` and `test:coverage`, in that order                 |

## Architecture

The code is organised in layers. Dependencies only point inwards, toward the domain.

| Folder                | Role                                                                                             | May import                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `app/`                | expo-router route files. Thin: they mount screens. The root layout receives the composition root | `presentation`, `di`, `assets/`, external modules                                                    |
| `src/domain/`         | Entities, value objects, business rules, business errors                                         | `domain`. No external module at all                                                                  |
| `src/application/`    | Use cases and ports (interfaces)                                                                 | `domain`, `application`. No external module at all                                                   |
| `src/infrastructure/` | Adapters implementing the ports (HTTP, persistence, in-memory, and so on)                        | `domain`, `application`, `infrastructure`, external modules                                          |
| `src/presentation/`   | Screens, components, hooks, stores, i18n, theme tokens                                           | `domain`, `application`, `presentation`, `assets/`, external modules. Never `infrastructure` or `di` |
| `src/di/`             | The single composition root that wires ports to adapters with manual typed injection             | `domain`, `application`, `infrastructure`, `di`. Never `presentation`                                |

An extra rule: the `zod` package may only be imported from `src/infrastructure`.

Everything else in the repository (`package.json`, the configs, `tooling/`, scripts) is tooling. Code under `app/` and `src/` cannot import it.

Path aliases map to the matching `src` folder: `@domain/*`, `@application/*`, `@infrastructure/*`, `@presentation/*` and `@di/*`. They resolve in TypeScript, Metro, Jest and ESLint.

### How the rule is enforced

- `eslint.config.mjs` classifies the files under `app/`, `src/` and `assets/` into the elements above with eslint-plugin-boundaries, and declares which element may depend on which.
- The plugin sees every file of the repository, dot files and dot folders included. A file under `app/` or `src/` that does not belong to any layer is an error (`boundaries/no-unknown-files`), and so is an import of any file that is not an app, layer or asset file, such as a script, a config, `package.json` or a test helper (`boundaries/no-unknown-dependencies`). Only `app/` and `presentation` may import `assets/`.
- Imports of external modules and Node.js core modules are checked too, which is what keeps `domain` and `application` free of any framework.
- A layer alias that does not resolve to a file is rejected instead of being mistaken for an external package. Aliases are resolved from an absolute tsconfig path, so ESLint gives the same result from any working directory.
- Type-only imports are checked like any other import, and so are `import('x')` types, `typeof import('x')`, `import x = require('x')`, `jest.mock` and the other Jest module calls, and `require.resolve`.
- `import()`, `require()`, the Jest module calls and `require.resolve` only accept a string literal under `app/` and `src/`, because a specifier built at runtime cannot be checked (`no-restricted-syntax`). `/// <reference path="..." />` is rejected as well.
- Packages are imported by name, never through a path in `node_modules` (`no-restricted-imports`), and every imported package must be declared in `package.json`, development dependencies being reserved to tests and tooling (`import/no-extraneous-dependencies`). Until `zod` is declared as a dependency, even `src/infrastructure` cannot import it.
- `src/domain` and `src/application` cannot use the ambient globals that reach the runtime environment: `process`, `window`, `document`, `fetch`, `localStorage`, timers, `console` and similar (`no-restricted-globals`). Their tests are exempt.
- `.mts` and `.cts` files are linted with the TypeScript parser like `.ts` files.

Known limit: an aliased `require` (`const r = require; r('x')`) cannot be detected by a lint rule.

### Tests

Test files are named `*.test.ts(x)` or `*.spec.ts(x)`. Jest runs four projects (`jest.config.js`):

- `core` covers `src/domain` and `src/application` in a plain Node environment, with no React Native or Expo setup. If either layer reaches for a framework API, its tests fail.
- `infra` covers `src/infrastructure` and `src/di` on the `jest-expo` preset, which mocks the native side of the Expo modules.
- `ui` covers `src/presentation` on the `jest-expo` preset, with React Native Testing Library. Route files stay thin, and the screens are tested on their own. `src/presentation/i18n/rootLayout.test.tsx` renders the real route tree (`app/_layout.tsx` and `app/index.tsx`) with `expo-router/testing-library`, so a root layout that stops mounting the `I18nProvider` fails a test. The i18n stack is never mocked: components are rendered with the real i18next and react-i18next, and a test sets the language through the provider, or, for the device language, by spying on `useLocales` (`i18n/testing/setDeviceLanguages.ts`).
- `tooling` covers `tooling/`, in a plain Node environment. It checks the repository itself: the tsconfig aliases match the folders of `src` and the Jest module name mapper, every test file lives under the root of a Jest project (a test that no project would run fails the suite), no test file sits under `app/`, the `commit-msg` hook accepts and rejects the right messages, the lint rules of the UI code accept and reject the right snippets (`lint-rules.test.ts`, which lints them with the real configuration through `lint-snippets.mjs`), and `app.config.ts` declares the same languages as the source code.

Do not put test files under `app/`: expo-router would treat them as routes.

The path aliases are declared once, in the `paths` of `tsconfig.json`. TypeScript, Metro and ESLint read them there, and `jest.config.js` derives its module name mapper from them.

The 90 percent coverage threshold (statements, branches, functions, lines) on `src/domain` and `src/application` is registered automatically as soon as a layer contains source files. It is checked by `npm run test:coverage`, which `npm run validate` ends with.

### Folder layout

```text
app/                      expo-router routes (_layout.tsx, index.tsx)
src/
  domain/                 entities, value-objects, errors
  application/            ports, use-cases
  infrastructure/         http, persistence, in-memory
  presentation/           screens, components, hooks
    i18n/                 translations, language detection, provider
    theme/                design tokens (colours, spacing, font sizes)
  di/                     composition root
assets/                   app icons (Expo template placeholders)
tooling/                  tests of the repository configuration (including the lint rules), types for the JS configs
app.config.ts             typed Expo config
eslint.config.mjs         ESLint flat config with the architecture rules
jest.config.js            Jest projects and coverage gate
```

## Internationalisation

Every user-facing text is translated, from the first screen. The app ships English and French. English is the fallback language and the source of truth for the set of keys. The code lives in `src/presentation/i18n`, because i18n is a presentation concern; `app/_layout.tsx` only mounts its provider.

| File                                 | Role                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `constants.ts`                       | `SUPPORTED_LANGUAGES`, `FALLBACK_LANGUAGE`, `DEFAULT_NAMESPACE`: the single source of truth         |
| `resources/en.ts`, `resources/fr.ts` | The translations, as TypeScript modules. `fr.ts` is typed against the shape of `en.ts`              |
| `resources/index.ts`                 | `RESOURCES`, typed over the supported languages, and `copyResources()`, a private copy per instance |
| `i18next.d.ts`                       | Types the keys through the `CustomTypeOptions` module augmentation (`strictKeyChecks`)              |
| `resolveLanguage.ts`                 | Pure function: device language tags in, supported language out                                      |
| `useDeviceLanguage.ts`               | Reads the device locales with `expo-localization` and feeds them to `resolveLanguage`               |
| `createI18n.ts`                      | Factory returning an initialised i18next instance with its own copy of the resources                |
| `translateCount.ts`                  | `translateCount(t, key, count)`: plural keys with a typed `count`                                   |
| `I18nProvider.tsx`                   | Creates the instance once and provides it, following the language of the device                     |
| `intlPluralRulesFallback.ts`         | `Intl.PluralRules` for the supported languages, installed only when the engine has none (Hermes)    |

Use a translation in a component:

```tsx
const { t } = useTranslation();
return <Text>{t('placeholder.message')}</Text>;
```

### Typed keys

The keys are typed from the English resource. These fail `npm run typecheck`:

- `t('unknown.key')` and `t('placeholder')` (a group of keys, not a translation);
- `t('unknown.key', 'Some text')` and `t('unknown.key', { defaultValue: 'Some text' })`. Without `strictKeyChecks: true` in `i18next.d.ts`, i18next switches the key check off as soon as a default text is given, which would let an untranslated text reach the screen;
- a French resource with a missing or an extra key, because `fr.ts` is typed `TranslationResource`, the shape of `en.ts`.

All of it is also asserted by tests (`@ts-expect-error` lines in `createI18n.test.ts`, `resources.test.ts` and `translateCount.test.ts`), so the guarantee cannot silently disappear. A lint rule rejects a literal default text on a valid key as well (see "What the linter enforces").

Keys are grouped by area (`app.name`, `placeholder.message`) in a single namespace. Add a text to `en.ts`, then to `fr.ts`: the typecheck fails until both exist.

What the types do **not** check is the parameters. `t('meetings.count')` with no `count`, or with a `count` that is a string (a route parameter, say), compiles and shows the raw key `meetings.count` to the user. So a plural key is read through `translateCount`, which only accepts a plural key and a `count` that is a number:

```tsx
const { t } = useTranslation();
return <Text>{translateCount(t, 'meetings.count', meetings.length)}</Text>;
```

### Adding a language

1. Add its code to `SUPPORTED_LANGUAGES`. The typecheck then asks for steps 2 and 3.
2. Create `resources/<code>.ts`, typed `TranslationResource`, and register it in `RESOURCES`.
3. Add its cardinal rule and its plural categories to `CARDINAL_RULES` and `CATEGORIES` in `intlPluralRulesFallback.ts`, with the same categories as the engine's own `Intl.PluralRules` (the parity test in `intlPluralRulesFallback.test.ts` compares them).
4. If the language has a plural category that `en.ts` does not list (French `many`, Russian `few`), add the matching `_<category>` entry to every plural key of `en.ts`: the other languages are typed against its shape.
5. Add the code to `SUPPORTED_LOCALES` in `app.config.ts`. `tooling/app-config.test.ts` fails if the two lists differ. The list is repeated there because Expo loads `app.config.ts` with plain Node.js module resolution, which cannot import the TypeScript constants of `src/`.

### Language detection

`resolveLanguage` takes the language tags of the device in the order of preference of the user (`['fr-CA', 'en-US']`) and returns the first supported language. The region is ignored (`fr-CA`, `fr-FR` and `fr-BE` are all `fr`, `en-GB` is `en`), the casing, the `_` or `-` separator and the whitespace around a tag are tolerated, and an unsupported or missing locale gives the fallback language. An entry that is not a string (`null`, `undefined`) is skipped instead of throwing, because the tags come from the native side. It is a pure function with unit tests; the only code that touches the device is the three lines of `useDeviceLanguage`.

`I18nProvider` follows the language of the device while the app runs: `useLocales` re-renders it when the user changes the system language or the per-app language, and the provider switches the language of its instance. Its optional `language` prop forces a language, which is what the tests use and what a future in-app language setting would use.

### One explicit provider, no global instance

react-i18next offers two wirings: the global `initReactI18next` plugin on the `i18next` singleton, or an `I18nextProvider` given an instance. This project uses the second, with `createI18n()` as an instance factory over `createInstance()`:

- every call returns an independent instance with its own deep copy of the resources (`copyResources()`), so tests never share state and never reset or mock the library. i18next keeps and mutates the object it is given, so the shared `RESOURCES` object never reaches an instance: `addResource` on one instance changes nothing for the others, nor the `en` and `fr` modules (`createI18n.test.ts` checks it);
- nothing runs at import time;
- the dependency is explicit: a component gets its translations from the provider above it.

Initialisation is synchronous (`initAsync: false`, resources in memory), so the first render is already translated.

### Per-app language settings

`app.config.ts` declares the supported languages to the `expo-localization` config plugin (`supportedLocales`). Prebuild writes them to `CFBundleLocalizations` on iOS and to `res/xml/locales_config.xml` with `android:localeConfig` on Android, which makes the app appear with its languages in the per-app language settings of the system (iOS 13+, Android 13+). The plugin also lets the Android activity handle locale changes without a restart, which the provider relies on. Run `npx expo prebuild` after changing the list (the native folders are generated, never committed).

### Plurals on Hermes

i18next picks a plural form through the global `Intl.PluralRules`. Hermes does not implement it, and since i18next 24 there is no fallback: without it every language gets the English rule "`one` if the count is 1, `other` otherwise". That is wrong for French, where 0 is singular ("0 réunion"). The usual fix is the `intl-pluralrules` polyfill; it is not a dependency of this project, so `intlPluralRulesFallback.ts` provides the cardinal rules of the supported languages instead, and installs them only when the engine has no `Intl.PluralRules`.

`meetings.count` is a pluralised key (`count_one`, `count_many`, `count_other`) that proves the pipeline before a real feature uses it. `plurals.test.ts` runs it in both languages, with the `Intl.PluralRules` of the engine and without it, and another test shows i18next alone getting French wrong. `intlPluralRulesFallback.test.ts` compares the fallback with the `Intl.PluralRules` of the engine for both languages, so that a count gets the same plural form on both.

Known limits, on purpose:

- Only cardinal plurals. Ordinals (`ordinal: true`) are not supported by the fallback.
- French has three categories: `one` (0 and 1), `many` (exact multiples of one million, "1000000 de réunions") and `other`. An engine with its own `Intl.PluralRules` selects `many` for them, and so does the fallback. A plural key therefore needs the three entries in `fr.ts`, and, because the shape of every language comes from `en.ts`, a `_many` entry in `en.ts` too, which English never shows. Without it, i18next would silently render the English text in a French UI for those counts on an engine that has `Intl.PluralRules`.
- If the app later needs more languages or ordinals, the maintained polyfill (`intl-pluralrules`) is the better answer than extending the fallback.

## No magic strings

A string literal is acceptable only when the type system verifies it: a member of a union type (`accessibilityRole="header"`, `fontWeight: '700'`), a typed translation key (`t('app.name')`), a typed route. Anything else is a named constant with a single definition.

| Kind of value                | Where it lives                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| User-facing text             | `src/presentation/i18n/resources`, read with `t('...')`             |
| Languages and the namespace  | `src/presentation/i18n/constants.ts`                                |
| Colours, spacing, font sizes | `src/presentation/theme/tokens.ts`, only the tokens in use          |
| Test IDs                     | A constants module, referenced from the component and from its test |

### What the linter enforces

In `app/` and `src/presentation`, `npm run lint` fails on:

- a string literal as a JSX child: JSX text, `{'text'}`, a template literal, and text reached through a conditional, a logical expression, an array or a type assertion (`{ok ? 'Yes' : 'No'}`, `{ok && 'Yes'}`, `{['a', 'b']}`, `{'Yes' as string}`, `{'Yes'!}`), at any nesting up to eight levels. `react/jsx-no-literals` covers the first three, and `no-restricted-syntax` selectors complete it, because the rule does not see the others;
- a string literal in a prop that reads like a text, written `prop="text"`, `prop={'text'}`, as a template literal, a concatenation, a conditional or a type assertion. Props are recognised by name, not from a list: `title`, `label`, `hint`, `description`, `subtitle`, `message`, `text`, `caption`, `placeholder`, `badge`, `alt`, any camelCase name that ends with one of them (`accessibilityLabel`, `headerBackTitle`, `tabBarBadge`, `emptyText`), and the `aria-*` props that hold a text. `react/jsx-no-literals` can only flag all props or none, so `accessibilityRole="header"`, `resizeMode="cover"`, `keyboardType="numeric"` and `aria-live="polite"` stay free;
- text in the object props of an element (`options`, `screenOptions`, any `*Options`, `accessibilityValue`, `accessibilityActions`), in the keys that read like a text (`title`, `drawerLabel`, `tabBarAccessibilityLabel`, ...), whether the key is written `key`, `'key'` or `['key']`. Typed keys such as `presentation: 'modal'` or `tabBarLabelPosition: 'below-icon'` stay free;
- text passed to `Alert` (title, message and button `text`), `ToastAndroid` and `AccessibilityInfo.announceForAccessibility`, by position, so that a typed argument such as the `'plain-text'` input type of `Alert.prompt` stays free; text given to `Share.share(...)` and `navigation.setOptions(...)`;
- a default text in a call of `t`: `t('key', 'Some text')` and `t('key', { defaultValue: 'Some text' })`. The types reject an unknown key even then (see Typed keys), but a text next to a valid key is still a text that lives outside the resources;
- a raw `testID` or `nativeID` literal, or a prop that ends with `TestID`;
- a raw colour: a hex string or an `rgb(...)` style function anywhere, and any string given to a colour property (`color`, `backgroundColor`, `borderTopColor`, ...) of a style. A style is the `style` prop (and any `*Style` prop), the argument of `StyleSheet.create`, `flatten` and `compose`, and a value typed or `satisfies`-checked as `ViewStyle`, `TextStyle`, `ImageStyle` or `StyleProp`. `src/presentation/theme` is where colours are written; the translation resources, which are free text, are exempt from the colour rules too.

Colour props of a component (`<Badge color="primary" />`) are deliberately **not** checked by name: such a prop may take a union of token names, which the type system verifies, and a rule cannot tell it from `<ActivityIndicator color="red" />`. A hex or `rgb(...)` value is still rejected there, by its value.

The name patterns and the lists of calls are constants at the top of the UI section of `eslint.config.mjs`. `tooling/lint-rules.test.ts` checks, with the real configuration, what is rejected and what stays accepted, so a rule that stops working fails the suite.

### What it cannot catch

A selector reads the syntax in front of it; it does not follow a value.

- A text held in a variable or a constant and rendered with `{label}`: the convention and code review cover it.
- A text returned by a call or a callback: `{String('Hello')}`, `{items.map(() => 'Item')}`.
- Numbers. Spacing, sizes and other numeric values are tokens by convention only; a rule on numbers would flag `flex: 1` and `zIndex`.
- A text prop whose name does not read like a text (`<Banner heading="Hello" />`), a text given to `value` or `defaultValue` of an input, and a text passed through a spread (`{...props}`). Name the prop with one of the words above, or review.
- A named colour (`'red'`) outside a style: in a plain object that is only later used as a style, or in a colour prop of a component. Use a token.
- A value nested in more than eight conditionals, which no component needs.
- A `t` that has been renamed (`const { t: translate } = useTranslation()`) when a default text is given to it.

## Git hooks and commit convention

Hooks are installed by `npm install` through the `prepare` script (Husky), provided the directory is already a Git repository (see Getting started). On installs without development dependencies, `prepare` does nothing instead of failing.

- `pre-commit` runs lint-staged (`eslint --fix` and `prettier --write` on the staged files), then `npm run typecheck`.
- `commit-msg` is a POSIX shell script with no dependency. It rejects any message that does not follow [Conventional Commits](https://www.conventionalcommits.org/): `type(scope)!: subject`, where scope and `!` are optional. Allowed types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore` and `revert`. The messages that git creates itself are let through: merges (`Merge branch`, `Merge remote-tracking branch`, `Merge tag`, `Merge commit`, `Merge pull request`), reverts, and the `fixup!`, `squash!` and `amend!` commits used with `git rebase --autosquash`. Any other message starting with `Merge` is rejected.

## Planned sections

The headings below are placeholders. Each one will be written in a later step, together with the feature it describes.

## Architecture diagram

> Placeholder: to be written in a later step.

## Native module

> Placeholder: to be written in a later step.

## Testing strategy

> Placeholder: to be written in a later step.

## CI/CD

> Placeholder: to be written in a later step.

## Migration strategy

> Placeholder: to be written in a later step.

## Mobile security

> Placeholder: to be written in a later step.

## ADR index

> Placeholder: to be written in a later step.
