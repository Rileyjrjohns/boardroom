# 0006. Expo Modules API rather than a raw TurboModule for ScreenProtection

- Status: Accepted
- Related: [0002](0002-expo-continuous-native-generation-and-dev-client.md), [0012](0012-security-model.md)

## Context

Confidential documents must stay out of screenshots, recordings and the app switcher as far as each platform allows, and the app must learn when a capture happens. No library does exactly this, so some native code has to be written: on Android `FLAG_SECURE` on the window and the capture callbacks (Android 14 and later for screenshots, 15 and later for recordings); on iOS a cover over the scene when it resigns active, the screenshot notification and the capture state of the scene. The module is small: two functions (`setProtectionEnabled`, `isCaptured`) and two events (`onScreenshotTaken`, `onCaptureChanged`).

## Decision

A local Expo module in `modules/screen-protection`, in Swift and Kotlin with a TypeScript entry, autolinked from `modules/`. It is the native half of the `ScreenProtection` port: `src/infrastructure/native` adapts it, and a lint rule lets no other folder import it. The module is a mechanism; which documents need protection is a policy of the application layer (`ScreenProtectionCoordinator`).

The Expo Modules API gives what this module needs without glue: autolinking and the build conventions of the SDK (so it survives prebuild, see [0002](0002-expo-continuous-native-generation-and-dev-client.md)), a Swift and Kotlin DSL (`AsyncFunction`, `Events`), the activity lifecycle as hooks (`OnActivityEntersForeground` sets the flag again on each new window), the counting of listeners (`OnStartObserving`, `OnStopObserving`), and a manifest that the build merges for the two Android permissions. There is no codegen step, no Objective-C++ entry and no registration in `MainApplication`.

## Consequences

- The native surface is one Swift file, three small Kotlin files (the module and its two detectors), a manifest and a TypeScript entry, with the same names in Swift, Kotlin and TypeScript. `tooling/screenProtectionModule.test.ts` fails when one of the three drifts.
- The module depends on the Expo runtime, so it is not a library for any React Native app.
- Jest never loads it: the adapter is tested against a seam (`ScreenProtectionModuleApi`) with a stand-in, and the port's contract suite runs against it. The native code itself was run on an Android 14 emulator and an iOS 27 simulator, not on a physical device, and recording events were not seen on either platform (see the README).
- It has the limits of the platforms, which the README states: iOS cannot block a screenshot, `FLAG_SECURE` belongs to one window, and Android before 14 has no screenshot detection.

## Alternatives considered

- **A raw TurboModule.** The README keeps a sketch (not compiled): a typed spec read by codegen, an Objective-C++ entry that calls Swift, a Kotlin module and package registered in `MainApplication` (so, a config plugin, since `android/` is generated), the activity lifecycle listener and the observer counting written by hand. The behaviour is the same, and the lines that carry it are about the same; the rest is glue the Expo API already owns. A TurboModule would pay off for a library meant to be used outside Expo, or when the spec should be the contract.
- **A community library.** None covers the combination of protection, the capture events on both platforms and the app switcher cover, and the module is small enough to own.
- **JavaScript only.** The `PrivacyCover` of the presentation exists as a fallback, but on iOS the snapshot of the app switcher can be taken before React renders again, and `FLAG_SECURE` cannot be set from JavaScript.
