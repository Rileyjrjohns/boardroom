# Native module: ScreenProtection

`modules/screen-protection` is a local Expo module, in Swift and Kotlin, that is the native half of the `ScreenProtection` port: it keeps a confidential screen out of the screenshots, the recordings and the app switcher as far as each platform allows (on iOS it also leaves the PDF and the watermark of a protected document out of screenshots, through a view of its own, and clears the text selection of the PDF views), and it tells the app when a screenshot or a recording happens. Expo autolinks it from the `modules/` folder (`expo-module.config.json`, an Android Gradle project, an iOS podspec); nothing is added to `app.config.ts` for it. The reasons for the choice of the Expo Modules API are in [ADR 0006](adr/0006-expo-modules-api-for-screen-protection.md).

## What it does, per platform

|                              | Android                                                                                                                                                                                            | iOS                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protection on                | `FLAG_SECURE` on the window of the current activity, on the main thread. The system **blocks screenshots and screen recordings** of that window and shows **a blank thumbnail in the recent apps** | A neutral native view (opaque, in the colour of the system background, no text) is put over the windows of the scene **whenever it resigns active** (app switcher, control centre, notification centre, a system prompt) and taken away when it becomes active again. The scene notifications are used (`UIScene.willDeactivateNotification`, `didActivateNotification`), because the app is scene based. This cover does not block screenshots or recordings: iOS has no public API for that (the PDF and the watermark have their own mechanism, see [The secure view](#the-secure-view)) |
| Protection off               | The flag is cleared                                                                                                                                                                                | No cover                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The PDF and the watermark    | A plain container: `FLAG_SECURE` already keeps the whole window out of captures                                                                                                                    | They are inside the secure view, which sets the private `disableUpdateMask` flag on its layer, the flag UIKit sets for secure text fields: they are left out of screenshots (see [The secure view](#the-secure-view))                                                                                                                                                                                                                                                                                                                                                                       |
| Text selection in a PDF      | Nothing to do: the viewer has no text selection on Android                                                                                                                                         | While protection is on, the selection of any `PDFView` is cleared on the main queue as soon as PDFKit reports it (`PDFViewSelectionChangedNotification`, observed with no object), and the edit menus of that view are dismissed every 100 ms for 10 s after it. Off: no observer                                                                                                                                                                                                                                                                                                           |
| Screenshot taken             | `Activity.ScreenCaptureCallback`, Android 14 (API 34) and later, with the `DETECT_SCREEN_CAPTURE` permission                                                                                       | `UIApplication.userDidTakeScreenshotNotification`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Recording started or stopped | `WindowManager.addScreenRecordingCallback`, Android 15 (API 35) and later, with the `DETECT_SCREEN_RECORDING` permission                                                                           | The capture state of the scenes on iOS 17 and later (`UITraitCollection.sceneCaptureState`, observed with `registerForTraitChanges` on each window scene), `UIScreen.isCaptured` and `UIScreen.capturedDidChangeNotification` before iOS 17 and for a scene that has no state. It covers recording, mirroring and AirPlay                                                                                                                                                                                                                                                                   |
| "Is it captured now"         | The state of the recording callback on Android 15 and later; `false` before                                                                                                                        | The same sources as above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Limits, stated plainly.**

- iOS has no public way to block a screenshot or a recording. What the app does there is the cover in the app switcher, the events (it learns of a capture after the fact), and, for the PDF and the watermark of a protected document, the secure view, which relies on an undocumented flag (see [The secure view](#the-secure-view) below, with what was verified and what was not). Everything outside the secure view stays in a screenshot: the title, the badges and the page indicator are not hidden, and a photograph of the screen is not affected. On a physical iPhone (iPhone 17, iOS 27) the `screenshotTaken` event reached the app, which showed its notice (seen before the secure view existed, and not looked at again since).
- Android before 14 has **no screenshot detection**, and before 15 **no recording detection**: the system tells apps nothing there, and the module reports nothing (the protection itself, `FLAG_SECURE`, works on every version). A device that has not got the permission (a build without the manifest of the module) simply has the detection off; the module catches the `SecurityException`.
- `FLAG_SECURE` belongs to one window. A window of its own, such as a React Native `Modal` or a system dialog over the app, is not covered by the flag of the activity.
- The iOS text selection is cleared, not prevented: it exists until the next turn of the main queue, and what takes away the edit menu is a sweep of 10 seconds after each selection (the menu is presented when the finger is lifted, after the selection has been cleared, so clearing alone leaves it there, empty). It relies on a PDFKit notification and on the `UIEditMenuInteraction` of the `PDFView`, so a viewer that is not a `PDFView` would need its own handling, and a version of iOS that changes the interactions of PDFKit could break it; the Maestro flow `document-no-copy` is what would tell. It is on only while protection is.
- The iOS cover is also put up while a system prompt (Face ID) is on screen, because the scene is then inactive. It is what the `PrivacyCover` of the presentation does in JavaScript too, and it is only up while protection is on.
- The simulator and the emulator are not devices: what they show for recordings and for the app switcher is reported below, with what could not be checked.

**The events, and their payloads.**

| Event               | Payload                 | Sent when                                                                                                                         |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `onScreenshotTaken` | none                    | A screenshot of the app was taken                                                                                                 |
| `onCaptureChanged`  | `{ captured: boolean }` | The screen started (`true`) or stopped (`false`) being recorded, mirrored or AirPlayed. Sent when the state changes, not repeated |

The functions are `setProtectionEnabled(enabled): Promise<void>` (idempotent, resolves once the change is made, rejects if the platform could not make it) and `isCaptured(): Promise<boolean>`. The names are the same in `ScreenProtectionModule.swift`, `ScreenProtectionModule.kt` and the TypeScript entry; `tooling/screenProtectionModule.test.ts` fails when one of the three drifts, and the adapter assigns the real module to its own seam (`ScreenProtectionModuleApi`), so the typecheck fails too.

**Why the cover is on only while protection is on (iOS), and not always.** The whole app holds confidential meeting data, so covering the app switcher everywhere is a defensible policy, and the module could do it with one line. It does not, for three reasons. First, the module is a mechanism and the policy belongs to the application layer: `ScreenProtectionCoordinator` decides which screens need protection (a confidential document, or any document served from the cache) and turns the switch on and off accordingly; making the whole app protected is a change there (acquire for the length of the open session), not in a native file. Second, it keeps the two platforms saying the same thing: a protected screen is blank in the app switcher (Android with the flag, iOS with the cover), an unprotected one is not, and the port stays a real switch instead of a no-op on iOS that no test could tell from a working one. Third, the app already has a JavaScript `PrivacyCover` for the rest (see [Session, lock and navigation](design-in-depth.md#session-lock-and-navigation)): it is best effort on iOS, because the snapshot of the app switcher can be taken before React renders again, which is exactly the gap the native cover closes for the screens that matter most. Closing it for every screen is the one decision left to the owner of the product; it is a policy, and now a cheap one.

**Robustness.**

- _Threads._ All the state of the module is read and written on the main thread (Swift: the main queue, Kotlin: `Looper.getMainLooper()`), every entry point hops there, and the async functions are declared to run on the main queue, so that `setProtectionEnabled` resolves after the change has been made.
- _No activity, no window._ On Android, turning protection on with no current activity only remembers it; the flag is set when an activity enters the foreground. Nothing throws for a missing activity or window.
- _Activity recreation._ `FLAG_SECURE` belongs to a window, and a new activity has a new one. The module sets the flag again every time an activity enters the foreground (`OnActivityEntersForeground`), so protection survives a rotation, a change of the font size, a theme change that recreates the activity, and the app coming back from the background. The detectors follow the current activity the same way.
- _Listeners follow the observers._ The listeners of the system (the screenshot callback, the recording callback, the notifications of the scene, the trait observers) exist only while JavaScript listens to the event they feed (`OnStartObserving`, `OnStopObserving`), and are all removed when the module is destroyed. The adapter, for its part, listens to the module once for all its subscribers and stops when the last one leaves.
- _The selection observer and its sweep._ Turned on and off with protection, like the cover: one observer of `PDFViewSelectionChangedNotification`, added on the main queue with `[weak self]`, and one timer (in the common run loop modes) that exists only after a selection, for 10 seconds, and is invalidated when protection is turned off or the module is destroyed.
- _Idempotent._ Turning protection on twice, or off twice, or off when it is off, is harmless on both platforms. When the module is destroyed (React Native reloads), protection is switched off and the window is left as it was found.
- _Permissions._ The two Android permissions are declared in the manifest of the module (`DETECT_SCREEN_CAPTURE`, `DETECT_SCREEN_RECORDING`), which the Android build merges into the manifest of the app; both are normal permissions, granted at install, so no prompt is shown. iOS needs no Info.plist entry and no text: the native code shows none.

## The secure view

`ScreenProtectionSecureView` is a native view of the module: a container that the presentation component `SecureContent` puts around the PDF and the watermark of the document screen, with `secure` set when the document is screen-protected. The loading veil is inside it, the title, the badges and the page indicator are outside.

- **iOS.** The view sets the private Core Animation property `disableUpdateMask` (the value `(1 << 1) | (1 << 4)`) on its own layer, through key-value coding, and only when the layer answers to `setDisableUpdateMask:`. It is the flag UIKit sets for a secure text field, and the reason such a field is left out of captures: the PDF and the watermark are left out of screenshots. The children are mounted by React as in any view, nothing is moved, so layout, safe areas and touches are unchanged: the PDF scrolls and zooms as usual.
- **What was verified.** On a physical iPhone 17 under iOS 27 the PDF and the watermark of a protected document display normally on the screen, and a screenshot of that document shows their area blank while the title, the badges and the page indicator stay visible. **Not verified:** screen recordings and mirroring with this version, any other iOS version, any other device, and the simulator.
- **It is undocumented behaviour.** The property is private to Core Animation: App Review may object to it, and an iOS update may change or remove it. When the layer has no such property the view falls back to a plain view, reports it (the `onSecureLayerFallback` event, once, and a line in the system log under the subsystem `com.boardroom.screenprotection`), and never crashes. A build whose native module predates the view gives a plain `View` in TypeScript, with the same event.
- **The first attempt did not work.** Hosting the content in the internal canvas of a secure text field (`isSecureTextEntry`), the known workaround of older iOS versions, still showed the document in a screenshot and in a screen recording on the same iPhone under iOS 27. That is why the flag is set directly, on the layer of the view, and no text field is involved.
- **Detection and the watermark still apply.** The screenshot event comes from the notification of the system, not from the view, so detection is unchanged (it was not looked at again on the phone with the flag). The watermark still deters a photograph of the screen and anything that is not left out of a capture; it is itself inside the secure view, so a screenshot that is left blank has no watermark in it.
- **Android.** `FLAG_SECURE` is unchanged and covers the whole window; the view is a plain container there, which accepts `secure` and lays nothing out itself (the Kotlin view compiled with the app, see below, and was not run).
- **Lint.** The module is imported by `src/infrastructure/native` alone, with one exception: `SecureContent.tsx` may import its secure view (the entry point of the module, never its functions or its files), because a native view is an element of the tree and no port, which carries data and calls, can pass one.

## How it plugs into the port

```text
ScreenProtectionCoordinator (application)  ->  ScreenProtection (port)
                                                      ^
                                             NativeScreenProtection (src/infrastructure/native)
                                                      |  ScreenProtectionModuleApi (the seam)
                                      modules/screen-protection (Swift, Kotlin, TypeScript entry)
```

- **The adapter** (`NativeScreenProtection`) implements the port over the seam `ScreenProtectionModuleApi`. It never throws and settles in bounded time: a module that rejects, throws, never answers (5 seconds) or is not there is a `screenProtectionFailed` result (or `screenProtectionUnsupported` for a missing module, which makes `OpenDocument` refuse to show a confidential document: it fails closed), also reported to the monitoring with a kind of failure and nothing else. `enable` and `disable` reach the module one at a time, in the order they were issued. Disabling something that cannot be enabled succeeds.
- **The events** are mapped to the domain's: `onScreenshotTaken` is `screenshotTaken`; `onCaptureChanged` with `captured: true` is `recordingStarted`, `false` is `recordingStopped`. A report that is not a state, or that repeats the known one, is dropped. A recording that is **already running** when someone subscribes is told to that subscriber as `recordingStarted`, from `isCaptured()`: a document opened while the screen is being recorded needs to know, and the module only reports changes.
- **Wiring.** `createExpoPlatform` loads the module through `loadScreenProtectionModule` (the one file that imports it, whose entry reads it with `requireOptionalNativeModule`: a build without it gives `undefined`, not a crash) and puts it in `DevicePlatform.screenProtectionModule`. Both configurations use the device's screen protection, because it is a concern of the device and not of the backend that is simulated: `httpPorts.ts` builds `NativeScreenProtection` over it, and so does `mockPorts.ts` when the build has the module. Without the module the mock configuration falls back on `InMemoryScreenProtection` (which records what it is asked and can report a capture, and is what Jest uses, since Jest has no native module), and the http one answers `screenProtectionUnsupported`. A test hands any other `ScreenProtection` to the container through `ContainerRuntime.screenProtection`.
- **Lint.** `modules/screen-protection` can be imported only from `src/infrastructure/native` (and its secure view from `SecureContent.tsx`, see [The secure view](#the-secure-view)): the dependency policies refuse it to every other layer, and a restricted-imports pattern keeps the rest of the infrastructure out too. `expo-crypto` is among the native modules that only `src/infrastructure` may import (`tooling/lint-rules.test.ts` checks both).
- **Tests.** The existing contract suite of the port (`describeScreenProtectionContract`) runs against the adapter, with a JavaScript stand-in for the native module (`FakeScreenProtectionModule`, in the testing folder of the infrastructure, the only native stand-in the project has for this module; the real module is Swift and Kotlin and needs a device). The stand-in turns protection on later than it turns it off, so the order of the calls is really tested. `NativeScreenProtection.test.ts` adds what the contract does not say: the failures, the timeout, the missing module, the listeners that exist only while someone is subscribed, the mapping, the repeats, the recording that is already running, a listener that throws. In Jest the module is absent: an empty module in the `infra` project, and `null` from `requireOptionalNativeModule` in the `ui` one.

## Why the Expo Modules API, and not a bare TurboModule

The brief of the module is small (two functions, two events, and lifecycle hooks) and the native work is all platform API; the glue is what would dominate in a TurboModule. What the Expo Modules API gives:

- **SDK integration.** The module is part of the Expo build: autolinked from `modules/` for both platforms, compiled with the Gradle plugin and the podspec conventions of the SDK, and regenerated with the rest by Continuous Native Generation. Nothing is patched into `MainApplication` or the Xcode project by hand, and the generated `ios/` and `android/` folders stay disposable.
- **A DSL in Swift and Kotlin** (`Name`, `Events`, `AsyncFunction`, `OnStartObserving`, `OnStopObserving`, `OnActivityEntersForeground`, `OnDestroy`) instead of a protocol, an Objective-C++ class and a Kotlin class for the same thing. The argument types are converted for you, and a thrown error becomes a rejected promise with a code.
- **The lifecycle of the activity and of the module**, as hooks, which is exactly what re-applying `FLAG_SECURE` on a recreated activity needs (a TurboModule has to register a `LifecycleEventListener` itself).
- **Events with the count of listeners.** `OnStartObserving` and `OnStopObserving` tell the module when JavaScript starts and stops listening to an event, so the system observers exist only while needed; the JavaScript side is a plain `addListener` with a typed events map.
- **Configuration and permissions.** A manifest in the module that the build merges (and, when needed, a config plugin) in place of editing the app's manifest.
- **The New Architecture without C++ glue.** The Expo module is exposed to JavaScript through JSI by the Expo runtime, which works on the New Architecture; there is no codegen step, no generated C++ and no `.mm` entry to write.
- **Testing.** The JavaScript surface is a TypeScript declaration, so a typed seam can be given a stand-in (as `FakeScreenProtectionModule` does) and the adapter tested with no native code. Expo ships the native test helpers too (Robolectric and XCTest bases) for the day the native code needs its own tests; none is written here.

What a TurboModule gives in return: no dependency on the Expo runtime (a library meant for any React Native app), a schema that is the contract (the spec file), and synchronous methods on the JS thread. None of those is a need of this app.

## What was run on the module, and what could not be

Everything below was run from the copy of the project without spaces in its path, with a throwaway harness that exists only there (a floating panel that calls the real adapter and logs its events, plus, on iOS, a command channel because the simulator cannot be tapped from a script). It is not part of the project.

**Android 14 (API 34 emulator, arm64).** The Kotlin module compiled and was autolinked; the merged manifest of the app has both permissions and the system granted `DETECT_SCREEN_CAPTURE` at install.

- _Protection on:_ the window carries `FLAG_SECURE`, and `adb exec-out screencap` is **refused** (exit code 1, no bytes) instead of answering a black frame; with protection off it returns the whole frame. The card of the app in the recent apps, captured through the emulator console (`screencap` is refused while a secure window is on screen), is **blank** with protection on and shows the screen with it off.
- _Screenshot event:_ `adb shell input keyevent 120` makes the emulator take a system screenshot, and `screenshotTaken` reached JavaScript through the adapter, with protection on as well as off (a screenshot that is blocked is still reported).
- _Recreation:_ with the font size changed (a configuration change the activity does not handle) the activity was recreated twice, each time with a new window, and `FLAG_SECURE` was set again. With the orientation lock removed in the generated manifest of the copy, a real rotation did the same: set again in each new window, screenshot refused in landscape while protected, allowed (and cleared) after turning it off.
- _Idempotence and the query:_ on, on, off, off all succeed; `isCaptured` answers `false`. A reload of the JavaScript (the development client) destroys the module and clears the flag, as designed.
- _Android 15 (API 35, a scratch emulator):_ both permissions are granted, the screenshot event and the protection work, the module's callback is registered with the system's recording callback controller (`dumpsys window`) with no warning from the module. **A recording was not started**: no way was found to start a screen recording from the command line, so `recordingStarted` and `recordingStopped` on Android have not been seen.

**iOS 27.0 (iPhone 17 simulator, Xcode 27.1).** The Swift module compiled once the trait observation was called under `MainActor.assumeIsolated` (the iOS 27 SDK declares it main-actor isolated; the entry points of the module are already on the main queue).

- _App switcher:_ the simulator's app switcher cannot be driven from a script here (see below), so the snapshot that the system writes when an app goes to the background (`Library/SplashBoard/Snapshots` in the app container, after launching another app with `simctl`) was decoded and looked at. With protection **on** it is blank (the native cover, white in light mode) over the whole window, hiding even the harness panel, except for the floating button of the development client, which is a window of its own above the normal level. With protection **off** it shows what the `PrivacyCover` of the JavaScript put on screen in time.
- _Screenshot:_ **Device > Trigger Screenshot could not be used.** Xcode 27 replaced Simulator.app with DeviceHub, and driving its menus needs the assistive access that the shell does not have (`osascript` is refused), so nothing was clicked and no setting was changed. What was run instead: the harness posted `UIApplication.userDidTakeScreenshotNotification` from inside the app, and `screenshotTaken` reached JavaScript 3 ms later. That checks the observer, the event and the mapping of the adapter; it does not check that the system posts the notification on a screenshot of a simulator or a phone.
- _Recording:_ `xcrun simctl io <device> recordVideo` **does not change the capture state**: `isCaptured` answered `false` before, during and after a recording, and no event came. A host-side recording of a simulator is not what iOS reports as a capture, so `recordingStarted` and `recordingStopped`, and the scene capture state itself, have not been seen on iOS. They need a phone and Control Centre's screen recording, or AirPlay.
- _Text selection:_ on the confidential report, a long-press on the middle of the PDF view and another on a word of the title bring **no selection and no menu**, and the same gesture on an internal document brings the selection with its handles and the menu (Copy, Select All, Look Up). Two things were found by running it, and are why the module does more than clear the selection: the selection is cleared, but PDFKit presents its edit menu when the finger is lifted, after that, and the menu stayed on screen (with a Copy item that copied nothing: the pasteboard did not change when it was tapped, while on the internal document it received the word); so the menu is dismissed in a short-lived sweep (see [What it does, per platform](#what-it-does-per-platform)). Maestro sees the menu on iOS, which is what the flow `document-no-copy` relies on. A pasteboard check from the host (`simctl pbpaste`) returned nothing even for a string put there with `simctl pbcopy`, so what was copied was read from inside the app, with a temporary logger that is not in the repository.
- _Idempotence and the query:_ on, on, off, off all succeed; `isCaptured` answers `false`.

**Android, the secure view.** The Kotlin view had never been compiled. `npx expo prebuild --platform android` and `./gradlew :app:assembleDebug` built the app with it in 1 minute 29 seconds (arm64 only), the module's Kotlin compiled without an error or a warning, and the view is in the dex of the debug APK. It was not run: no layout, no touch and no capture was exercised on Android with it.

**iPhone 17 (physical), iOS 27.** Checked by hand by the owner, with the version that sets the flag: the PDF and the watermark of a protected document display normally, and a screenshot of that document shows their area blank, with the title, the badges and the page indicator still visible. The version before it, which hosted the content in the internal canvas of a secure text field, showed the document in the screenshot and in a screen recording on this phone, and was replaced. A screen recording and mirroring were not looked at with the flag.

**Not run at all:** the secure view on a recording, on mirroring, on an iOS version other than 27 and on a device other than that iPhone 17, and any physical Android device; Android before 14; recording detection on either platform; the `UIScreen` fallback of iOS 16; the iOS cover on a scene that resigns active because of a system prompt (it is the same notification, but no prompt was shown); `FLAG_SECURE` on a React Native `Modal` (it is not covered, by the design of the flag).

Nothing in the TurboModule sketch above was compiled.

## How the same module would look as a TurboModule

A sketch, to compare, not code in the project. It has the same two functions and two events.

**1. The typed spec, read by codegen** (`src/NativeScreenProtection.ts`). Events use the typed event emitters of the New Architecture (`CodegenTypes.EventEmitter`, React Native 0.78 and later; check the exact import of the version in use):

```ts
import { TurboModuleRegistry } from 'react-native';
import type { CodegenTypes, TurboModule } from 'react-native';

export interface Spec extends TurboModule {
  setProtectionEnabled(enabled: boolean): Promise<void>;
  isCaptured(): Promise<boolean>;
  readonly onScreenshotTaken: CodegenTypes.EventEmitter<void>;
  readonly onCaptureChanged: CodegenTypes.EventEmitter<{ captured: boolean }>;
}

export default TurboModuleRegistry.get<Spec>('ScreenProtection');
```

and the `codegenConfig` that tells the build where it is (in the `package.json` of the app or of a library that holds the module):

```json
{
  "codegenConfig": {
    "name": "ScreenProtectionSpec",
    "type": "modules",
    "jsSrcsDir": "src",
    "android": { "javaPackageName": "com.boardroom.screenprotection" },
    "ios": { "modulesProvider": { "ScreenProtection": "RCTScreenProtection" } }
  }
}
```

**2. What codegen generates.** From the spec, on each platform, an interface that the native class must satisfy, and the C++ JSI binding that nobody writes by hand: on iOS an Objective-C++ protocol `NativeScreenProtectionSpec` (with `setProtectionEnabled:resolve:reject:` and `isCaptured:reject:`) and a base class `NativeScreenProtectionSpecBase` that has `emitOnScreenshotTaken` and `emitOnCaptureChanged:`; on Android an abstract Java class `NativeScreenProtectionSpec` with abstract `setProtectionEnabled(boolean, Promise)` and `isCaptured(Promise)` and the `emitOnScreenshotTaken()` and `emitOnCaptureChanged(ReadableMap)` helpers.

**3. iOS: an Objective-C++ entry that calls Swift.** A TurboModule's iOS side must be an Objective-C++ class, because it returns the C++ JSI object. The logic can stay in Swift, behind an `@objc` class that the `.mm` file calls through the generated `-Swift.h` header:

```objc
// RCTScreenProtection.mm
#import "RCTScreenProtection.h"
#import <ScreenProtectionSpec/ScreenProtectionSpec.h>
#import "Boardroom-Swift.h"   // the Swift implementation, below

@interface RCTScreenProtection () <NativeScreenProtectionSpec>
@end

@implementation RCTScreenProtection

RCT_EXPORT_MODULE(ScreenProtection)

- (void)setProtectionEnabled:(BOOL)enabled
                     resolve:(RCTPromiseResolveBlock)resolve
                      reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{
    [ScreenProtectionImpl.shared setEnabled:enabled];
    resolve(nil);
  });
}

- (void)isCaptured:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_main_queue(), ^{ resolve(@(ScreenProtectionImpl.shared.isCaptured)); });
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeScreenProtectionSpecJSI>(params);
}

@end
```

```swift
// ScreenProtectionImpl.swift: what ScreenProtectionModule.swift does today, minus the DSL.
@objc public final class ScreenProtectionImpl: NSObject {
  @objc public static let shared = ScreenProtectionImpl()
  @objc public var onScreenshot: (() -> Void)?      // the .mm calls emitOnScreenshotTaken from it
  @objc public var onCaptureChange: ((Bool) -> Void)?
  @objc public func setEnabled(_ enabled: Bool) { /* the cover, on the scene notifications */ }
  @objc public var isCaptured: Bool { /* the scene capture state */ false }
}
```

The events are emitted from the Objective-C++ class (`[self emitOnScreenshotTaken]`, `[self emitOnCaptureChanged:@{ @"captured": @YES }]`), and it must start and stop the observers itself, since there is no `OnStartObserving`: either always on, or by overriding `addListener` / `removeListeners`-style hooks that the legacy event emitter has and the typed emitters do not.

**4. Android: the Kotlin TurboModule and its package.**

```kotlin
@ReactModule(name = ScreenProtectionModule.NAME)
class ScreenProtectionModule(private val context: ReactApplicationContext) :
  NativeScreenProtectionSpec(context), LifecycleEventListener {

  init { context.addLifecycleEventListener(this) }          // the Expo DSL gives this as a hook

  override fun getName() = NAME

  override fun setProtectionEnabled(enabled: Boolean, promise: Promise) {
    UiThreadUtil.runOnUiThread {
      protectionEnabled = enabled
      applyFlag(context.currentActivity)
      promise.resolve(null)
    }
  }

  override fun isCaptured(promise: Promise) = promise.resolve(recording.isVisible())

  override fun onHostResume() = applyFlag(context.currentActivity)   // activity recreated
  override fun onHostPause() {}
  override fun onHostDestroy() {}

  private fun onScreenshot() = emitOnScreenshotTaken()
  private fun onCapture(captured: Boolean) =
    emitOnCaptureChanged(Arguments.createMap().apply { putBoolean("captured", captured) })

  companion object { const val NAME = "ScreenProtection" }
}

class ScreenProtectionPackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == ScreenProtectionModule.NAME) ScreenProtectionModule(context) else null

  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(ScreenProtectionModule.NAME to ReactModuleInfo(
      ScreenProtectionModule.NAME, ScreenProtectionModule.NAME,
      false, false, false, true /* isTurboModule */))
  }
}
```

The package has to be registered in `MainApplication.getPackages()`: `PackageList(this).packages.apply { add(ScreenProtectionPackage()) }`. In this project `android/` is generated, so that line would need a config plugin, or the module would have to live in a library package that autolinking finds through `react-native.config.js`, which is more files. The Expo module needs none of it.

**What it would cost here:** a spec file, a `codegenConfig`, one Objective-C++ file and its header, a Swift class behind it, a Kotlin module and package, a registration in `MainApplication` (through a config plugin), the lifecycle listener and the observer counting written by hand, and a codegen run in the build. The behaviour is the same; the lines that carry it are about the same; the rest is glue that the Expo Modules API already owns.
