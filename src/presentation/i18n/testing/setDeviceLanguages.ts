import * as Localization from 'expo-localization';

// The native localization module is replaced by the jest-expo preset (a device set to en-US). A
// test sets another device language by spying on the hook that reads it, so that i18next and
// react-i18next stay the real ones. For tests only: nothing in the app imports this file.

const [baseLocale] = Localization.getLocales();

/**
 * Makes the device report these language tags, most preferred first (`'fr-CA'`, `'en-US'`).
 * Undo it with `jest.restoreAllMocks()`.
 */
export function setDeviceLanguages(...languageTags: [string, ...string[]]): void {
  const [first, ...others] = languageTags;
  jest
    .spyOn(Localization, 'useLocales')
    .mockReturnValue([
      { ...baseLocale, languageTag: first },
      ...others.map((languageTag) => ({ ...baseLocale, languageTag })),
    ]);
}
