import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from '../src/presentation/i18n/constants';

// app.config.ts is loaded by Expo with plain Node.js module resolution, so it cannot import the
// supported languages from src/. This test keeps its copy of the list in step with the source of
// truth, and checks that the localization plugin stays declared.

const LOCALIZATION_PLUGIN = 'expo-localization';

const config = jest.requireActual<{ default: ExpoConfig }>('../app.config.ts').default;

function pluginOptions(name: string): unknown {
  const plugin = config.plugins?.find((entry) => Array.isArray(entry) && entry[0] === name);
  return Array.isArray(plugin) ? plugin[1] : undefined;
}

describe('app.config.ts', () => {
  it('declares the expo-localization config plugin', () => {
    expect(
      config.plugins?.some((entry) => Array.isArray(entry) && entry[0] === LOCALIZATION_PLUGIN),
    ).toBe(true);
  });

  it('declares the supported languages of the app to the operating system', () => {
    expect(pluginOptions(LOCALIZATION_PLUGIN)).toEqual({
      supportedLocales: [...SUPPORTED_LANGUAGES],
    });
  });
});

describe('app.config.ts, the native modules of the real adapters', () => {
  it('builds SQLite with SQLCipher, so that the local database can be encrypted', () => {
    expect(pluginOptions('expo-sqlite')).toEqual({ useSQLCipher: true });
  });

  it('declares the secure storage and the biometrics, with the same Face ID text', () => {
    const secureStore = pluginOptions('expo-secure-store') as { faceIDPermission?: string };
    const localAuthentication = pluginOptions('expo-local-authentication') as {
      faceIDPermission?: string;
    };

    expect(secureStore.faceIDPermission).toEqual(expect.stringContaining('Face ID'));
    expect(localAuthentication.faceIDPermission).toBe(secureStore.faceIDPermission);
  });

  it('puts no secret in the configuration: no key, token or password', () => {
    expect(JSON.stringify(config)).not.toMatch(/secret|token|password|api[_-]?key/i);
  });
});

describe('app.config.ts, the plugins of the native build', () => {
  const SCENE_PLUGIN = './plugins/withSceneLifecycle';

  it('puts the iOS project on the UIScene life cycle, which the iOS 27 SDK requires, with a local plugin', () => {
    expect(config.plugins).toContain(SCENE_PLUGIN);
    expect(fs.existsSync(path.resolve(__dirname, '..', `${SCENE_PLUGIN}.js`))).toBe(true);
  });

  it('declares the plugin of react-native-blob-util, with no option: it has no certificate to add', () => {
    expect(config.plugins).toContain('react-native-blob-util');
  });

  it('has no plugin for the local module ScreenProtection, which autolinking and its own manifest cover', () => {
    const names = (config.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry));

    expect(names.filter((name) => /screen-?protection/i.test(String(name)))).toEqual([]);
  });
});

describe('app.config.ts, the Face ID text in the languages of the app', () => {
  const ROOT = path.resolve(__dirname, '..');
  const FACE_ID_KEY = 'NSFaceIDUsageDescription';
  const others = SUPPORTED_LANGUAGES.filter((language) => language !== FALLBACK_LANGUAGE);

  it('has a file of Info.plist strings for every language but the default one', () => {
    expect(Object.keys(config.locales ?? {}).sort()).toEqual([...others].sort());
  });

  it.each(others)('has the Face ID text in %s, which is not the English one', (language) => {
    const file = (config.locales ?? {})[language];
    if (typeof file !== 'string') throw new Error(`No file of strings for ${language}.`);

    const strings = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8')) as Record<
      string,
      string
    >;

    expect(strings[FACE_ID_KEY]?.trim()).toBeTruthy();
    expect(strings[FACE_ID_KEY]).not.toBe(
      (pluginOptions('expo-local-authentication') as { faceIDPermission: string }).faceIDPermission,
    );
    expect(strings[FACE_ID_KEY]).not.toContain('"');
  });
});
