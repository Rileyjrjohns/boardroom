import type { ExpoConfig } from 'expo/config';

import { SUPPORTED_LANGUAGES } from '../src/presentation/i18n/constants';

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
