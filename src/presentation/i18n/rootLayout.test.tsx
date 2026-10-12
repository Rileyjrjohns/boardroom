import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import { SUPPORTED_LANGUAGES } from './constants';
import { createI18n } from './createI18n';
import { setDeviceLanguages } from './testing/setDeviceLanguages';

// Renders the real route tree, app/_layout.tsx and app/index.tsx included, the way expo-router
// does on a device. It is the only test that notices a root layout which stops mounting the
// I18nProvider: the screens would then render raw translation keys. The device language is the
// only thing replaced; i18next and react-i18next are the real ones.

afterEach(() => {
  // renderRouter switches to fake timers.
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('root layout', () => {
  it.each(SUPPORTED_LANGUAGES)('provides the translations to the routes in %s', (language) => {
    setDeviceLanguages(language);
    const { t } = createI18n(language);

    renderRouter();

    expect(screen.getByRole('header', { name: t('app.name') })).toBeTruthy();
    expect(screen.getByText(t('placeholder.message'))).toBeTruthy();
  });

  it('follows a regional variant of the device language', () => {
    setDeviceLanguages('fr-CA', 'en-US');
    const french = createI18n('fr');
    const english = createI18n('en');

    renderRouter();

    expect(screen.getByText(french.t('placeholder.message'))).toBeTruthy();
    expect(screen.queryByText(english.t('placeholder.message'))).toBeNull();
  });
});
