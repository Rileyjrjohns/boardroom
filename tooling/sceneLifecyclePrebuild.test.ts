import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// plugins/withSceneLifecycle.js as a prebuild runs it: `expo prebuild --platform ios --no-install`
// on a copy of the configuration in a directory of the system, which the real project never sees
// (a prebuild writes ios/, and the real project keeps its native folders out of reach). The copy
// shares the node_modules of the repository by a link, so nothing is installed.

const ROOT = path.resolve(__dirname, '..');
const EXPO = path.join(ROOT, 'node_modules', 'expo', 'bin', 'cli');
const PROJECT_NAME = 'Boardroom';
const PREBUILD_TIMEOUT_MILLIS = 120_000;

/** What the copy needs to evaluate app.config.ts and its plugins. */
const COPIED = ['app.config.ts', 'package.json', 'tsconfig.json', 'plugins', 'assets', 'locales'];
/** The module of the device, copied when there is one: prebuild does not need it, autolinking does. */
const OPTIONAL = ['modules'];

let directory = '';

function copyProject(): string {
  const target = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'boardroom-prebuild-'));
  for (const name of [...COPIED, ...OPTIONAL]) {
    const source = path.join(ROOT, name);
    if (fs.existsSync(source)) fs.cpSync(source, path.join(target, name), { recursive: true });
  }
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(target, 'node_modules'), 'dir');
  return target;
}

function prebuild(cwd: string): void {
  const run = spawnSync(process.execPath, [EXPO, 'prebuild', '--platform', 'ios', '--no-install'], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1', EXPO_NO_GIT_STATUS: '1' },
  });
  if (run.status !== 0) throw new Error(`expo prebuild failed:\n${run.stdout}\n${run.stderr}`);
}

const iosFile = (name: string): string =>
  fs.readFileSync(path.join(directory, 'ios', PROJECT_NAME, name), 'utf8');
const project = (): string =>
  fs.readFileSync(
    path.join(directory, 'ios', `${PROJECT_NAME}.xcodeproj`, 'project.pbxproj'),
    'utf8',
  );
const occurrences = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;
/** The project without the identifiers Xcode objects get: they are drawn again by every prebuild. */
const withoutIdentifiers = (text: string): string => text.replace(/\b[0-9A-F]{24}\b/g, 'ID');

beforeAll(() => {
  directory = copyProject();
  prebuild(directory);
}, PREBUILD_TIMEOUT_MILLIS);

afterAll(() => {
  // The link goes first: removing the directory must never follow it into node_modules.
  fs.rmSync(path.join(directory, 'node_modules'), { force: true });
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('expo prebuild --platform ios, with the scene life cycle plugin', () => {
  it('writes SceneDelegate.swift next to the AppDelegate', () => {
    const scene = iosFile('SceneDelegate.swift');

    expect(scene).toContain('@objc(SceneDelegate)');
    expect(scene).toContain('class SceneDelegate: ExpoAppSceneDelegate');
  });

  it('patches the AppDelegate: it provides the factory and no longer creates the window', () => {
    const appDelegate = iosFile('AppDelegate.swift');

    expect(appDelegate).toContain(
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
    );
    expect(appDelegate).not.toContain('startReactNative');
    expect(appDelegate).not.toContain('UIWindow(frame');
  });

  it('declares the scene manifest in Info.plist, with the scene delegate by name', () => {
    const plist = iosFile('Info.plist');

    expect(plist).toContain('<key>UIApplicationSceneManifest</key>');
    expect(plist).toContain('<key>UIApplicationSupportsMultipleScenes</key>');
    expect(plist).toContain('<string>$(PRODUCT_MODULE_NAME).SceneDelegate</string>');
  });

  it('adds the scene delegate to the sources of the app target, once', () => {
    const pbxproj = project();

    expect(occurrences(pbxproj, /SceneDelegate\.swift in Sources/g)).toBe(2);
    expect(occurrences(pbxproj, /isa = PBXFileReference[^\n]*SceneDelegate\.swift/g)).toBe(1);
  });

  it('keeps the other settings of the configuration in Info.plist', () => {
    const plist = iosFile('Info.plist');

    expect(plist).toContain('<key>NSFaceIDUsageDescription</key>');
    expect(plist).toContain('<string>exp+boardroom</string>');
  });

  it(
    'gives the same result when the prebuild is run again over its own output',
    () => {
      const before = {
        appDelegate: iosFile('AppDelegate.swift'),
        plist: iosFile('Info.plist'),
        scene: iosFile('SceneDelegate.swift'),
        pbxproj: withoutIdentifiers(project()),
      };

      prebuild(directory);

      expect(iosFile('AppDelegate.swift')).toBe(before.appDelegate);
      expect(iosFile('Info.plist')).toBe(before.plist);
      expect(iosFile('SceneDelegate.swift')).toBe(before.scene);
      expect(withoutIdentifiers(project())).toBe(before.pbxproj);
      expect(occurrences(project(), /SceneDelegate\.swift in Sources/g)).toBe(2);
    },
    PREBUILD_TIMEOUT_MILLIS,
  );
});
