// The transformations that put the iOS project of Expo SDK 57 on the UIScene life cycle, as pure
// functions over text and plist data, so that they are tested with fixtures (see
// tooling/sceneLifecyclePlugin.test.ts) and `withSceneLifecycle.js` only wires them to the mods of
// the prebuild.
//
// WHY. The iOS 27 SDK stops an app at launch unless it adopts the scene-based life cycle. The
// runtime of Expo SDK 57 already ships what it takes (`ExpoAppSceneDelegate`, the
// `ExpoReactNativeFactoryProvider` protocol), but the iOS template of SDK 57 still creates the
// window in the AppDelegate. The template of SDK 58 does it right; the three changes below are the
// difference between the two.
//
// REMOVE THIS FOLDER WITH SDK 58. When the project moves to Expo SDK 58, delete `plugins/`, the
// entry that names it in app.config.ts and tooling/sceneLifecyclePlugin*.test.ts. On a template
// that already has the three changes every function here is a no-op, so leaving the plugin in place
// for a while does no harm.

/** The name of the class of the scene, and of the file that holds it. */
const SCENE_DELEGATE_CLASS = 'SceneDelegate';
const SCENE_DELEGATE_FILE = `${SCENE_DELEGATE_CLASS}.swift`;

/** What the SDK 58 template puts in `SceneDelegate.swift`. */
const SCENE_DELEGATE_SOURCE = `internal import Expo

@objc(${SCENE_DELEGATE_CLASS})
class ${SCENE_DELEGATE_CLASS}: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

const PROVIDER_PROTOCOL = 'ExpoReactNativeFactoryProvider';

/** `class AppDelegate: ExpoAppDelegate {`, the declaration of the SDK 57 template. */
const LEGACY_DECLARATION = /^(class AppDelegate: ExpoAppDelegate)( \{)$/m;
/** The same declaration once it conforms to the provider protocol. */
const PROVIDER_DECLARATION =
  /^class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider \{$/m;
/**
 * The block that creates the window and starts React Native in it, written as the SDK 57 template
 * writes it. The module name must be "main": it is the one the scene delegate starts by default
 * (`ExpoReactNativeFactoryProvider.reactNativeFactoryModuleName`), so any other name means the
 * AppDelegate was edited and a rewrite would change what the app starts.
 */
const WINDOW_BLOCK =
  /^#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif\n\n?/m;
/** Any start of React Native from the app delegate, whatever its shape. */
const START_CALL = /\bstartReactNative\(/;

/** What replaces the block, from the SDK 58 template. */
const WINDOW_REPLACEMENT = `    // The window is created and React Native is started by \`SceneDelegate\` under the
    // scene-based life cycle (required by the iOS 27 SDK).
`;

/**
 * Raised when a file is not in a shape this plugin knows how to change. Prebuild stops on it: a
 * silent no-op would give an app that builds and then closes at launch on iOS 27.
 */
class UnexpectedProjectShapeError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(
      `[withSceneLifecycle] ${message} The plugin was written for the iOS template of Expo SDK 57; ` +
        'if the project moved to SDK 58 or later, remove the plugin (see plugins/sceneLifecycle.js).',
    );
    this.name = 'UnexpectedProjectShapeError';
  }
}

/**
 * Makes the `AppDelegate` conform to `ExpoReactNativeFactoryProvider` and stops it from creating
 * the window: the scene delegate does both. Idempotent: a source that already conforms and no
 * longer starts React Native is returned as it is. Any other shape throws.
 *
 * The Linking overrides of the template (`open url`, `continue userActivity`) are kept on purpose:
 * `ExpoAppSceneDelegate` forwards the scene events to them and does not deliver a link twice to an
 * app delegate that already calls `RCTLinkingManager` (see `SceneEventForwarder.swift` in `expo`).
 *
 * @param {string} source The content of AppDelegate.swift.
 * @returns {string}
 */
function patchAppDelegate(source) {
  const conforms = PROVIDER_DECLARATION.test(source);
  const starts = START_CALL.test(source);

  if (conforms && !starts) return source;
  if (conforms || !starts) {
    throw new UnexpectedProjectShapeError(
      conforms
        ? 'AppDelegate.swift conforms to ExpoReactNativeFactoryProvider but still starts React Native itself.'
        : 'AppDelegate.swift does not start React Native, so there is no window to hand over to the scene.',
    );
  }
  if (!LEGACY_DECLARATION.test(source)) {
    throw new UnexpectedProjectShapeError(
      'AppDelegate.swift does not declare `class AppDelegate: ExpoAppDelegate {`.',
    );
  }
  if (!WINDOW_BLOCK.test(source)) {
    throw new UnexpectedProjectShapeError(
      'AppDelegate.swift does not create the window the way the SDK 57 template does.',
    );
  }

  return source
    .replace(LEGACY_DECLARATION, `$1, ${PROVIDER_PROTOCOL}$2`)
    .replace(WINDOW_BLOCK, WINDOW_REPLACEMENT);
}

/** The key of the scene manifest in Info.plist. */
const SCENE_MANIFEST_KEY = 'UIApplicationSceneManifest';

/** The manifest of the SDK 58 template: one window scene, whose delegate is `SceneDelegate`. */
function sceneManifest() {
  return {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: `$(PRODUCT_MODULE_NAME).${SCENE_DELEGATE_CLASS}`,
        },
      ],
    },
  };
}

/**
 * Declares the scene manifest in the Info.plist data. Idempotent: a manifest equal to the expected
 * one is left alone. A different manifest is somebody else's decision about the scenes of the app,
 * and is not overwritten: it throws.
 *
 * @param {Record<string, unknown>} infoPlist The parsed Info.plist.
 * @returns {Record<string, unknown>} The same data with the manifest.
 */
function addSceneManifest(infoPlist) {
  const expected = sceneManifest();
  const present = infoPlist[SCENE_MANIFEST_KEY];
  if (present === undefined) return { ...infoPlist, [SCENE_MANIFEST_KEY]: expected };
  if (JSON.stringify(present) === JSON.stringify(expected)) return infoPlist;
  throw new UnexpectedProjectShapeError(
    `Info.plist already has a ${SCENE_MANIFEST_KEY} that is not the one of the template.`,
  );
}

module.exports = {
  SCENE_DELEGATE_FILE,
  SCENE_DELEGATE_SOURCE,
  SCENE_MANIFEST_KEY,
  UnexpectedProjectShapeError,
  addSceneManifest,
  patchAppDelegate,
};
