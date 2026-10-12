import type { ExpoConfig } from 'expo/config';

// Languages the app is translated into, declared to the operating system for the per-app language
// settings. Expo loads this file with plain Node.js module resolution, which cannot import the
// TypeScript constants of src/ (no path alias, no extensionless .ts), so the list is repeated here.
// tooling/app-config.test.ts fails when it drifts from SUPPORTED_LANGUAGES.
const SUPPORTED_LOCALES = ['en', 'fr'];

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
    // Set here and not at the top level: on Android the top-level key does nothing unless
    // expo-system-ui is installed, and only logs a warning on every prebuild and start.
    userInterfaceStyle: 'light',
  },
  android: {
    // Placeholder identifier, to be replaced before any store submission.
    package: 'com.boardroom.demo',
    // Boardroom handles confidential governance material: keep it out of Android backups.
    allowBackup: false,
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
  plugins: [
    'expo-router',
    // Makes the supported languages selectable in the per-app language settings of the device
    // (iOS and Android 13+). Written to CFBundleLocalizations and to Android's locales_config.xml.
    ['expo-localization', { supportedLocales: SUPPORTED_LOCALES }],
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
