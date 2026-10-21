import type { ExpoConfig } from 'expo/config';

// Languages the app is translated into, declared to the operating system for the per-app language
// settings. Expo loads this file with plain Node.js module resolution, which cannot import the
// TypeScript constants of src/ (no path alias, no extensionless .ts), so the list is repeated here.
// tooling/app-config.test.ts fails when it drifts from SUPPORTED_LANGUAGES.
const SUPPORTED_LOCALES = ['en', 'fr'];

// What the system asks the user when the app first uses Face ID, in English, which is also the
// default of the other languages. The French text is in locales/fr.json, which Expo turns into the
// localised Info.plist strings of the iOS project (see `locales` below). Android has no such
// prompt text: the text of its biometric prompt is the one the app passes at run time, translated.
// It is the same for both plugins that write it, so that neither can overwrite the other's.
const FACE_ID_USAGE_DESCRIPTION =
  'Allow Boardroom to use Face ID to unlock the app and to confirm your vote.';

// Settings of the build, read from the environment of whoever runs it (the shell, the secrets of the
// CI, the environment variables of EAS). None of them is a secret that ends up in the app, and none
// has a value in this repository: see "Secrets and variables" in docs/ci-cd.md and .env.example. A
// blank value counts as missing.
const setting = (name: string): string | undefined => {
  const value = process.env[name]?.trim();
  return value === undefined || value === '' ? undefined : value;
};

// The id of the EAS project: where the app looks for its updates, and what the EAS tools need to
// find the project. Without it the build has no updates, which is what a local or a CI build wants.
const EAS_PROJECT_ID = setting('EAS_PROJECT_ID');
const EAS_UPDATES_URL = 'https://u.expo.dev';

// The source maps are uploaded to Sentry by the native builds, which needs an organisation, a
// project and a token. The plugin is added only when all three are there: without it the build
// does not touch Sentry, so a local or CI build never fails for lack of a token. The token itself
// is read by the build scripts from the environment and never enters this configuration.
const SENTRY_ORGANIZATION = setting('SENTRY_ORG');
const SENTRY_PROJECT = setting('SENTRY_PROJECT');
const SENTRY_SERVER = setting('SENTRY_URL');
const uploadsSourceMaps =
  SENTRY_ORGANIZATION !== undefined &&
  SENTRY_PROJECT !== undefined &&
  setting('SENTRY_AUTH_TOKEN') !== undefined;

// The number of the store build, for the Fastlane lanes, which number the builds themselves (the
// next one after the store's). EAS numbers them remotely, and is never given this.
const BUILD_NUMBER = Number(setting('BOARDROOM_BUILD_NUMBER'));
const hasBuildNumber = Number.isSafeInteger(BUILD_NUMBER) && BUILD_NUMBER > 0;

// The New Architecture is always enabled from Expo SDK 55 onwards (React Native 0.82 removed
// the opt-out), so there is intentionally no `newArchEnabled` flag in this config.
const config: ExpoConfig = {
  name: 'Boardroom',
  slug: 'boardroom',
  scheme: 'boardroom',
  version: '1.0.0',
  orientation: 'portrait',
  // Placeholder artwork from the Expo template, to be replaced by the Boardroom brand assets.
  icon: './assets/icon.png',
  platforms: ['ios', 'android'],
  ios: {
    // Placeholder identifier, to be replaced before any store submission.
    bundleIdentifier: 'com.boardroom.demo',
    supportsTablet: true,
    ...(hasBuildNumber ? { buildNumber: String(BUILD_NUMBER) } : {}),
    // Set here and not at the top level: on Android the top-level key does nothing unless
    // expo-system-ui is installed, and only logs a warning on every prebuild and start.
    userInterfaceStyle: 'light',
  },
  android: {
    // Placeholder identifier, to be replaced before any store submission.
    package: 'com.boardroom.demo',
    // Boardroom handles confidential governance material: keep it out of Android backups.
    allowBackup: false,
    ...(hasBuildNumber ? { versionCode: BUILD_NUMBER } : {}),
    // Permissions that the Expo template adds by default and that the app does not need. The
    // SYSTEM_ALERT_WINDOW permission is kept: the development client overlays rely on it.
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
    ],
    // Placeholder artwork and background colour from the Expo template.
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  // The strings of the iOS Info.plist (the Face ID usage description) in the languages other than
  // English. Each file maps the plist key to its text, no secret in it: it is shipped in the app.
  locales: {
    fr: './locales/fr.json',
  },
  plugins: [
    'expo-router',
    // Makes the supported languages selectable in the per-app language settings of the device
    // (iOS and Android 13+). Written to CFBundleLocalizations and to Android's locales_config.xml.
    ['expo-localization', { supportedLocales: SUPPORTED_LOCALES }],
    // The local database (the cache of meetings and the outbox of votes) is encrypted: SQLCipher
    // replaces the SQLite of the system in both native projects. Without it the app refuses to open
    // the database (see "Persistence" in docs/design-in-depth.md), it never stores the data in
    // clear.
    ['expo-sqlite', { useSQLCipher: true }],
    // The session token and the key of the database live in the keychain (iOS) and the keystore
    // (Android). The plugin keeps them out of the automatic backups of Android.
    ['expo-secure-store', { faceIDPermission: FACE_ID_USAGE_DESCRIPTION }],
    // Face ID and the biometric permissions of Android, for the unlock of the app and the
    // confirmation of a vote.
    ['expo-local-authentication', { faceIDPermission: FACE_ID_USAGE_DESCRIPTION }],
    // expo-network has no plugin: its permission (ACCESS_NETWORK_STATE) comes with the module.
    // The documents are downloaded with react-native-blob-util, whose plugin only bundles extra
    // certificate authorities (`customCACerts`): there are none, so it changes nothing today. It is
    // declared so that adding one is a setting and not a new plugin.
    'react-native-blob-util',
    // The iOS 27 SDK stops an app at launch unless it uses the UIScene life cycle, and the iOS
    // template of Expo SDK 57 does not generate it yet. Local plugin, to delete with SDK 58 (see
    // "iOS scene life cycle" in docs/build-setup.md).
    './plugins/withSceneLifecycle',
    // The upload of the source maps and of the debug files to Sentry, so that the crash reports
    // are readable. Only when the build can upload (see `uploadsSourceMaps`); the reports are sent
    // either way, and are read as minified code without it.
    ...(uploadsSourceMaps
      ? [
          [
            '@sentry/react-native/expo',
            {
              organization: SENTRY_ORGANIZATION,
              project: SENTRY_PROJECT,
              ...(SENTRY_SERVER === undefined ? {} : { url: SENTRY_SERVER }),
            },
          ] as [string, Record<string, string | undefined>],
        ]
      : []),
    // The local native module ScreenProtection (modules/screen-protection) has no plugin: its
    // Android permissions are in its own manifest, which autolinking merges, and it needs nothing in
    // the iOS project.
  ],
  // Over-the-air updates (expo-updates), published with EAS Update. The runtime version is the
  // `version` above: an update only reaches the builds of the same version, so the version is
  // raised whenever the native code changes (a package, a plugin, a native module). The channel of a
  // build is set by its profile in eas.json. Off when the project id is not given.
  runtimeVersion: { policy: 'appVersion' },
  updates:
    EAS_PROJECT_ID === undefined
      ? { enabled: false }
      : {
          url: `${EAS_UPDATES_URL}/${EAS_PROJECT_ID}`,
          // Looks for an update when the app starts, and starts with the one it has: the new one
          // is used at the next start, so nobody waits for the network on the way in.
          checkAutomatically: 'ON_LOAD',
          fallbackToCacheTimeout: 0,
        },
  ...(EAS_PROJECT_ID === undefined ? {} : { extra: { eas: { projectId: EAS_PROJECT_ID } } }),
  experiments: {
    typedRoutes: true,
  },
};

export default config;
