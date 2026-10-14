import fs from 'node:fs';
import path from 'node:path';

import {
  SCENE_DELEGATE_SOURCE,
  SCENE_MANIFEST_KEY,
  UnexpectedProjectShapeError,
  addSceneManifest,
  patchAppDelegate,
} from '../plugins/sceneLifecycle';

// The transformations of plugins/withSceneLifecycle.js, on the files the SDK 57 template writes (the
// fixtures are copies of what `expo prebuild` generates) and on the one of SDK 58. The plugin as a
// whole, through a real prebuild, is in sceneLifecyclePrebuild.test.ts.

const FIXTURES = path.resolve(__dirname, 'fixtures', 'ios');
const fixture = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

const SDK_57 = fixture('AppDelegate.sdk57.swift');
const SDK_57_PATCHED = fixture('AppDelegate.sdk57.patched.swift');
const SDK_58 = fixture('AppDelegate.sdk58.swift');

describe('patchAppDelegate', () => {
  it('hands the window to the scene: conforms to the provider and no longer starts React Native', () => {
    const patched = patchAppDelegate(SDK_57);

    expect(patched).toBe(SDK_57_PATCHED);
    expect(patched).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    expect(patched).not.toContain('startReactNative');
    expect(patched).not.toContain('UIWindow(frame');
    // The factory is still created here: the scene delegate asks the provider for it.
    expect(patched).toContain('reactNativeFactory = factory');
    expect(patched).toContain('var window: UIWindow?');
  });

  it('keeps everything else of the file, the links included', () => {
    const patched = patchAppDelegate(SDK_57);

    expect(patched).toContain('RCTLinkingManager.application(app, open: url, options: options)');
    expect(patched).toContain('class ReactNativeDelegate: ExpoReactNativeFactoryDelegate');
    expect(patched).toContain('.expo/.virtual-metro-entry');
  });

  it('is idempotent: a patched file is returned as it is', () => {
    expect(patchAppDelegate(SDK_57_PATCHED)).toBe(SDK_57_PATCHED);
    expect(patchAppDelegate(patchAppDelegate(SDK_57))).toBe(SDK_57_PATCHED);
  });

  it('leaves the template of SDK 58 alone: it is already what this plugin makes', () => {
    expect(patchAppDelegate(SDK_58)).toBe(SDK_58);
  });

  it('tolerates other indentation and line spacing in the block it replaces', () => {
    const reindented = SDK_57.replace(
      /\n {4}(window = |factory\.|withModuleName|in: window|launch)/g,
      '\n\t$1',
    );

    expect(patchAppDelegate(reindented)).toContain('ExpoReactNativeFactoryProvider');
    expect(patchAppDelegate(reindented)).not.toContain('startReactNative');
  });

  describe('fails loudly on a shape it does not know', () => {
    const rejected = {
      'an Objective-C app delegate': '#import "AppDelegate.h"\n@implementation AppDelegate\n@end\n',
      'an empty file': '',
      'a class that is not an ExpoAppDelegate': SDK_57.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: UIResponder, UIApplicationDelegate {',
      ),
      'a React Native module that is not "main"': SDK_57.replace(
        'withModuleName: "main"',
        'withModuleName: "boardroom"',
      ),
      'a window that is not created the way the template does': SDK_57.replace(
        'window = UIWindow(frame: UIScreen.main.bounds)',
        'window = UIWindow(frame: .zero)',
      ),
      'launch options that are not passed on': SDK_57.replace(
        'launchOptions: launchOptions)',
        'launchOptions: nil)',
      ),
      'a file that starts nothing': SDK_57.replace(/#if os[\s\S]*?#endif\n/, ''),
      'a file that conforms and still starts React Native': SDK_57.replace(
        'class AppDelegate: ExpoAppDelegate {',
        'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      ),
    } as const;

    it.each(Object.entries(rejected))('rejects %s', (_name, source) => {
      expect(() => patchAppDelegate(source)).toThrow(UnexpectedProjectShapeError);
    });

    it('names the plugin, and says how to get rid of it', () => {
      expect(() => patchAppDelegate('')).toThrow(/withSceneLifecycle.*remove the plugin/s);
    });
  });
});

describe('addSceneManifest', () => {
  const MANIFEST = {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: {
      UIWindowSceneSessionRoleApplication: [
        {
          UISceneConfigurationName: 'Default Configuration',
          UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
        },
      ],
    },
  };

  it('declares one window scene, whose delegate is SceneDelegate', () => {
    const plist = { CFBundleName: 'Boardroom' };

    expect(addSceneManifest(plist)).toEqual({ ...plist, [SCENE_MANIFEST_KEY]: MANIFEST });
  });

  it('does not change the data it is given', () => {
    const plist = { CFBundleName: 'Boardroom' };

    addSceneManifest(plist);

    expect(plist).toEqual({ CFBundleName: 'Boardroom' });
  });

  it('is idempotent', () => {
    const once = addSceneManifest({});

    expect(addSceneManifest(once)).toBe(once);
    expect(addSceneManifest(addSceneManifest({}))).toEqual(once);
  });

  it('does not overwrite a manifest somebody else wrote', () => {
    const other = { [SCENE_MANIFEST_KEY]: { UIApplicationSupportsMultipleScenes: true } };

    expect(() => addSceneManifest(other)).toThrow(UnexpectedProjectShapeError);
  });
});

describe('SceneDelegate.swift', () => {
  it('subclasses the scene delegate of Expo and is visible to Objective-C under its own name', () => {
    expect(SCENE_DELEGATE_SOURCE).toContain('internal import Expo');
    expect(SCENE_DELEGATE_SOURCE).toContain('@objc(SceneDelegate)');
    expect(SCENE_DELEGATE_SOURCE).toContain('class SceneDelegate: ExpoAppSceneDelegate');
  });

  it('is what the template of SDK 58 writes, up to the wording of the comment', () => {
    const template = fixture('SceneDelegate.sdk58.swift');

    expect(SCENE_DELEGATE_SOURCE.replace(/\/\/.*\n/, '')).toBe(template.replace(/\/\/.*\n/, ''));
  });
});
