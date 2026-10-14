# 0002. Expo with Continuous Native Generation and a development client

- Status: Accepted
- Related: [0006](0006-expo-modules-api-for-screen-protection.md), [0007](0007-eas-as-the-default-delivery-pipeline.md), [0013](0013-uiscene-life-cycle-through-a-local-config-plugin.md)

## Context

The app needs native capabilities that Expo Go does not have (SQLite built with SQLCipher, a local native module, a PDF view). It must build the same way on every machine, and its native projects must not become a place where undocumented hand edits pile up. The team that would maintain it also has to keep up with React Native releases.

## Decision

Expo SDK 57 (React Native 0.86, the New Architecture, always on from SDK 55), with Continuous Native Generation:

- `ios/` and `android/` are produced by `expo prebuild` from `app.config.ts` and the config plugins, and are git-ignored. Native configuration is written in `app.config.ts` and in `plugins/`, never in the generated folders.
- The app runs in a development client (`expo-dev-client`), not in Expo Go.
- Native code of our own is a local Expo module (`modules/screen-protection`), autolinked, and a local config plugin (`plugins/withSceneLifecycle`).
- `tooling/` tests check what prebuild writes (`sceneLifecyclePrebuild.test.ts` runs a real prebuild in a temporary directory).

## Consequences

- A native change is a reviewed diff of plugin or module code. An SDK upgrade is a version bump, a prebuild and the removal of the workarounds the new SDK makes useless.
- A hand edit in `ios/` or `android/` is lost at the next prebuild. That is the point, and a cost to learn.
- Every native need becomes a plugin or a module. For small needs this is more ceremony than editing a file.
- The toolchain can run ahead of the SDK: Xcode 27 needed [a plugin](0013-uiscene-life-cycle-through-a-local-config-plugin.md) on SDK 57.
- A development build is required before the first run (the native toolchain, and a project path without spaces: an Expo build script fails on one).
- The generated native folders are not the host project of an existing native app, so this layout does not carry over to a brownfield integration as it is (see the migration section of the README).

## Alternatives considered

- **Bare React Native** (the community template, native folders in git). Full control and no abstraction, but upgrades are manual diffs of two native projects and every native change is a hand edit that nothing reviews as configuration.
- **Expo Go.** Not possible: the app needs SQLCipher, `react-native-pdf` and a local module.
- **Prebuild once, then commit `ios/` and `android/`.** Gives up regeneration, which is what removes the drift.
