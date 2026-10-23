import fs from 'node:fs';
import path from 'node:path';

import type { ExpoConfig } from 'expo/config';

import { FALLBACK_LANGUAGE, SUPPORTED_LANGUAGES } from '../src/core/presentation/i18n/constants';

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

describe('app.config.ts, updates and the release build', () => {
  const VARIABLES = [
    'EAS_PROJECT_ID',
    'SENTRY_ORG',
    'SENTRY_PROJECT',
    'SENTRY_AUTH_TOKEN',
    'SENTRY_URL',
    'BOARDROOM_BUILD_NUMBER',
  ] as const;
  const PROJECT_ID = '00000000-0000-4000-8000-000000000000';
  const SENTRY_PLUGIN = '@sentry/react-native/expo';

  /** The configuration Expo would read in an environment that has exactly these variables. */
  function configWith(env: Partial<Record<(typeof VARIABLES)[number], string>>): ExpoConfig {
    const saved = Object.fromEntries(VARIABLES.map((name) => [name, process.env[name]]));
    VARIABLES.forEach((name) => delete process.env[name]);
    Object.assign(process.env, env);
    try {
      let loaded: ExpoConfig | undefined;
      jest.isolateModules(() => {
        loaded = jest.requireActual<{ default: ExpoConfig }>('../app.config.ts').default;
      });
      if (loaded === undefined) throw new Error('The configuration did not load.');
      return loaded;
    } finally {
      VARIABLES.forEach((name) => delete process.env[name]);
      Object.entries(saved).forEach(([name, value]) => {
        if (value !== undefined) process.env[name] = value;
      });
    }
  }

  const pluginNames = (value: ExpoConfig): unknown[] =>
    (value.plugins ?? []).map((entry) => (Array.isArray(entry) ? entry[0] : entry));

  it('ties the runtime version of the updates to the version of the app', () => {
    expect(configWith({}).runtimeVersion).toEqual({ policy: 'appVersion' });
  });

  it('turns the updates off, and names no project, when no EAS project id is given', () => {
    const bare = configWith({});

    expect(bare.updates).toEqual({ enabled: false });
    expect(bare.extra).toBeUndefined();
  });

  it('points the updates at the EAS project of the environment, and looks for them at start', () => {
    const configured = configWith({ EAS_PROJECT_ID: PROJECT_ID });

    expect(configured.updates).toEqual({
      url: `https://u.expo.dev/${PROJECT_ID}`,
      checkAutomatically: 'ON_LOAD',
      fallbackToCacheTimeout: 0,
    });
    expect(configured.extra).toEqual({ eas: { projectId: PROJECT_ID } });
  });

  it('counts a blank project id as missing', () => {
    expect(configWith({ EAS_PROJECT_ID: '   ' }).updates).toEqual({ enabled: false });
  });

  it('has no project id, no organisation and no token of its own in the repository', () => {
    const text = fs.readFileSync(path.resolve(__dirname, '..', 'app.config.ts'), 'utf8');

    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    expect(text).not.toMatch(/sntrys_|sntryu_|https:\/\/[0-9a-f]{16,}@/);
  });

  describe('the upload of the source maps to Sentry', () => {
    it('is not declared by default, so that no build needs a token', () => {
      expect(pluginNames(configWith({}))).not.toContain(SENTRY_PLUGIN);
    });

    it.each([
      ['the token', { SENTRY_ORG: 'org', SENTRY_PROJECT: 'project' }],
      ['the organisation', { SENTRY_PROJECT: 'project', SENTRY_AUTH_TOKEN: 'a' }],
      ['the project', { SENTRY_ORG: 'org', SENTRY_AUTH_TOKEN: 'a' }],
      [
        'everything but a blank token',
        { SENTRY_ORG: 'org', SENTRY_PROJECT: 'p', SENTRY_AUTH_TOKEN: ' ' },
      ],
    ])('is not declared without %s', (_missing, env) => {
      expect(pluginNames(configWith(env))).not.toContain(SENTRY_PLUGIN);
    });

    it('is declared with the organisation and the project, and never the token, when all three are there', () => {
      const uploading = configWith({
        SENTRY_ORG: 'the-org',
        SENTRY_PROJECT: 'the-project',
        SENTRY_AUTH_TOKEN: 'a-token-that-must-not-leak',
      });

      expect(uploading.plugins).toContainEqual([
        SENTRY_PLUGIN,
        { organization: 'the-org', project: 'the-project' },
      ]);
      expect(JSON.stringify(uploading)).not.toContain('a-token-that-must-not-leak');
    });

    it('takes the address of the server when the organisation is not on sentry.io', () => {
      const uploading = configWith({
        SENTRY_ORG: 'o',
        SENTRY_PROJECT: 'p',
        SENTRY_AUTH_TOKEN: 'a',
        SENTRY_URL: 'https://de.sentry.io/',
      });

      expect(uploading.plugins).toContainEqual([
        SENTRY_PLUGIN,
        { organization: 'o', project: 'p', url: 'https://de.sentry.io/' },
      ]);
    });
  });

  describe('the build number of the Fastlane lanes', () => {
    it('is left to the stores tools when none is given (EAS numbers its builds remotely)', () => {
      const bare = configWith({});

      expect(bare.ios).not.toHaveProperty('buildNumber');
      expect(bare.android).not.toHaveProperty('versionCode');
    });

    it('is written to both platforms when it is a positive whole number', () => {
      const numbered = configWith({ BOARDROOM_BUILD_NUMBER: '42' });

      expect(numbered.ios?.buildNumber).toBe('42');
      expect(numbered.android?.versionCode).toBe(42);
    });

    it.each(['0', '-1', '1.5', 'abc'])('is ignored when it is %s', (value) => {
      const ignored = configWith({ BOARDROOM_BUILD_NUMBER: value });

      expect(ignored.ios).not.toHaveProperty('buildNumber');
      expect(ignored.android).not.toHaveProperty('versionCode');
    });
  });
});
