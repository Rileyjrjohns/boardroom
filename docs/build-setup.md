# Build and project setup

How the native side of the project is built and configured: the iOS scene life cycle plugin that the iOS 27 SDK needs, and the notes on the configuration of the repository that are easy to trip over. The reasons for the plugin are in [ADR 0013](adr/0013-uiscene-life-cycle-through-a-local-config-plugin.md), and those for generating the native folders in [ADR 0002](adr/0002-expo-continuous-native-generation-and-dev-client.md).

## iOS scene life cycle

**Why.** The iOS 27 SDK (Xcode 27) stops an app at launch, with the message "UIScene life cycle is required for apps built with this SDK", unless it adopts the scene-based life cycle: a scene delegate creates the window, and the app delegate no longer does. The runtime of Expo SDK 57 already has what it takes (`ExpoAppSceneDelegate`, which creates the window and starts React Native into it, and the `ExpoReactNativeFactoryProvider` protocol, through which it asks the app delegate for the factory it made), but the iOS template that `expo prebuild` writes for SDK 57 is the old one: the app delegate creates the window itself, there is no scene delegate and no scene manifest. Built with Xcode 27 it compiles, and dies when it starts. The template of SDK 58 is the fixed one.

**What the plugin does.** `plugins/withSceneLifecycle.js` is a local config plugin, declared in `app.config.ts`, that makes a prebuild of SDK 57 write what the SDK 58 template writes. The three changes are pure functions in `plugins/sceneLifecycle.js`, which the plugin hands to the mod of the prebuild that owns each file:

| File                  | Change                                                                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SceneDelegate.swift` | Written next to `AppDelegate.swift` (a subclass of `ExpoAppSceneDelegate`, `@objc(SceneDelegate)`) and added to the sources of the app target in the Xcode project                                |
| `AppDelegate.swift`   | Conforms to `ExpoReactNativeFactoryProvider`, and no longer creates the window nor starts React Native: the `#if os(iOS) \|\| os(tvOS)` block with `UIWindow(frame:)` and `startReactNative` goes |
| `Info.plist`          | Declares `UIApplicationSceneManifest`: one window scene, no multiple scenes, whose delegate is `$(PRODUCT_MODULE_NAME).SceneDelegate`                                                             |

- **Idempotent.** A prebuild over its own output, and a template that already has the change (the one of SDK 58), give the same files: `SceneDelegate.swift` is written only when it is missing (a file somebody extended is kept), the project does not list it twice, and an app delegate that already conforms and no longer starts React Native is returned as it is.
- **Fails loudly.** An `AppDelegate.swift` that is not the one of the SDK 57 template (another declaration, a window created another way, a React Native module that is not `"main"`, a file that conforms and still starts React Native, an Objective-C one) stops the prebuild with `UnexpectedProjectShapeError`, which names what is wrong and says how to get rid of the plugin. So does an `Info.plist` that already holds a different scene manifest. A silent no-op would give an app that builds and then closes at launch.
- **The links keep working.** The `open url` and `continue userActivity` overrides of the SDK 57 template are left in place: `ExpoAppSceneDelegate` forwards the scene events to the app delegate, and does not deliver a link twice to an app delegate that already calls `RCTLinkingManager` (the forwarder watches for the notification that `RCTLinkingManager` posts).

**Tests.** `tooling/sceneLifecyclePlugin.test.ts` runs the transformations on fixtures: the `AppDelegate.swift` that an SDK 57 prebuild generates, the result that is expected (it differs from the SDK 58 template by the two link overrides only), the SDK 58 template (left alone), and the shapes that must be refused. `tooling/sceneLifecyclePrebuild.test.ts` runs `expo prebuild --platform ios --no-install` on a copy of the configuration in a directory of the system (never in the project, whose native folders do not exist) and checks the files it writes, the entries of the Xcode project, and that a second prebuild over the first changes nothing.

**Removing it with SDK 58.** The plugin is a bridge, written to be deleted. When the project moves to Expo SDK 58: delete `plugins/`, the `./plugins/withSceneLifecycle` entry of `app.config.ts`, `tooling/sceneLifecyclePlugin.test.ts`, `tooling/sceneLifecyclePrebuild.test.ts` and `tooling/fixtures/ios/`, and run `npx expo prebuild --clean`. Nothing else refers to it. Leaving it for a while is harmless, since it does nothing on the new template.

**What was run.** From a copy of the project without spaces in its path (an Expo build script breaks on a path with one), `expo prebuild` and `expo run:ios` built the app with Xcode 27.1 for an iOS 27.0 simulator (iPhone 17) without an error, and it launched and reached the sign-in screen (before the plugin, the same build died at launch with the UIScene message). The development client showed its menu on the very first launch only. Nothing was run on a physical iPhone.

## Project setup notes

Notes on the configuration of the repository that are easy to trip over.

### Git hooks and `npm install`

The Git hooks are installed by the `prepare` script, and only when `npm install` runs inside a Git repository. Husky skips the installation without failing when `.git` does not exist yet, so after a `git init` that comes later, run `npm run prepare` once and check that `git config core.hooksPath` prints `.husky/_`.

### Typed routes

`experiments.typedRoutes` is on, but expo-router writes the route types (`.expo/types/router.d.ts`, git-ignored) only while the dev server runs. On a fresh clone, and in CI, `npm run typecheck` does not check `href` values until `npm start` has run once: a misspelled route still compiles. Start the dev server once after cloning, and after adding a route, to get the check locally. Gating routes in CI needs a step that starts Metro briefly before `tsc`; the pipeline described under [CI/CD](ci-cd.md#cicd) does not have one, so a misspelled `href` is not caught there.

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
- `expo-localization` was added with `npx expo install`, so that its version matches the SDK. It provides the device language and a config plugin (see [Internationalisation](conventions.md#internationalisation)).
- `intl-pluralrules`, the usual polyfill for `Intl.PluralRules` on Hermes, is deliberately not a dependency: see [Plurals on Hermes](conventions.md#plurals-on-hermes).

### Dependencies of the real adapters

Added with `npx expo install`, so that their versions match the SDK: `expo-sqlite` (built with SQLCipher by its config plugin), `expo-secure-store`, `expo-crypto` (the random bytes of the key of the database), `expo-local-authentication`, `expo-network` and `expo-file-system` (the content of the documents). The viewer adds `react-native-pdf` and its peer `react-native-blob-util` (which nothing of the app imports). `react-native-pdf` brings `crypto-js` 4.2.0, used only to hash the source URI into the name of a cache file, with no cryptographic role here. `zod` is a regular dependency, imported by the infrastructure folders only (a lint rule), and `msw` a development dependency, imported by tests and test support only. Nothing else was added for them: no polyfill, no hash package (the name of a downloaded file is the digest of a short text, which a few lines of TypeScript compute: see [Documents and watermark](design-in-depth.md#documents-and-watermark)), no PDF library (the demo content is written by a tiny writer of the infrastructure), no UUID package, no TypeScript runner and no HTTP framework. The things that would have been convenient and are not there, and what was done instead: excluding the database from the iOS backup (a file system package or a native module: documented as not covered), a UUID for the tokens of the mock API (`crypto.randomUUID()` of Node, the server is a Node program) and a TypeScript runner for `npm run mock:api` (the type stripping of Node 24 and a resolver hook of a few lines).

### Dependencies of delivery and monitoring

`@sentry/react-native` is a regular dependency, imported by `src/core/infrastructure/monitoring/SentryMonitoring.ts` alone (a lint rule), and `expo-updates` carries the over-the-air updates, configured from the environment in `app.config.ts`. Fastlane is not an npm package: it is declared in the `Gemfile` and installed with Bundler. How each is used is under [CI/CD](ci-cd.md#cicd).
