# 0013. Adopting the UIScene life cycle on SDK 57 through a local config plugin

- Status: Accepted, to be removed with Expo SDK 58
- Related: [0002](0002-expo-continuous-native-generation-and-dev-client.md)

## Context

An app built with the iOS 27 SDK (Xcode 27) is stopped at launch with "UIScene life cycle is required for apps built with this SDK" unless it adopts the scene life cycle: a scene delegate creates the window and the app delegate no longer does. The runtime of Expo SDK 57 already supports it (`ExpoAppSceneDelegate`, and the `ExpoReactNativeFactoryProvider` protocol through which it asks the app delegate for the factory), but the iOS template that `expo prebuild` writes for SDK 57 is the old one. Built with Xcode 27 the app compiles and dies when it starts, which was observed on an iOS 27 simulator.

## Decision

A local config plugin, `plugins/withSceneLifecycle.js`, declared in `app.config.ts`, makes a prebuild of SDK 57 write what the SDK 58 template writes. The changes are three pure functions in `plugins/sceneLifecycle.js`, each handed to the prebuild mod that owns the file:

- `SceneDelegate.swift` (a subclass of `ExpoAppSceneDelegate`) is written next to the app delegate and added to the sources of the app target;
- `AppDelegate.swift` conforms to `ExpoReactNativeFactoryProvider` and no longer creates the window nor starts React Native;
- `Info.plist` declares `UIApplicationSceneManifest`: one window scene, no multiple scenes, whose delegate is `$(PRODUCT_MODULE_NAME).SceneDelegate`.

The plugin is idempotent (a second prebuild, or the SDK 58 template, gives the same files) and fails loudly: an `AppDelegate.swift` that is not the SDK 57 template, or an `Info.plist` with a different scene manifest, stops the prebuild with `UnexpectedProjectShapeError`. A silent no-op would give an app that builds and then closes at launch. It is written to be deleted: [the build setup document](../build-setup.md#ios-scene-life-cycle) lists the files to remove with SDK 58.

## Consequences

- The fix is reviewable code with tests (`tooling/sceneLifecyclePlugin.test.ts` on fixtures, `tooling/sceneLifecyclePrebuild.test.ts` on a real prebuild in a temporary directory), and survives every prebuild.
- With the plugin, the app was built with Xcode 27.1 for an iOS 27.0 simulator, launched, and reached the sign-in screen. It was not run on a physical iPhone.
- The links keep working: the `open url` and `continue userActivity` overrides of the SDK 57 template are kept, and the scene delegate forwards the events.
- One more piece to maintain until the upgrade, with a coupling to the shape of a template. The plugin is the part that breaks first, loudly, when the template changes.
- The native module of [0006](0006-expo-modules-api-for-screen-protection.md) observes the scene notifications, because the app is scene based.

## Alternatives considered

- **Edit `ios/` by hand.** Lost at the next prebuild, which is what Continuous Native Generation is for.
- **A patch on the template package (patch-package).** Works, and is invisible to a reader of `app.config.ts` and fragile across installs.
- **Wait for SDK 58.** In the meantime an app built with Xcode 27 dies at launch, so iOS could not be run at all.
- **Build with the previous iOS SDK.** Possible only until the stores require the newer one, and it avoids the problem instead of solving it.
