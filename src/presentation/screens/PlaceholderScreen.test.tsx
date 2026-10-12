import { render, screen } from '@testing-library/react-native';

import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@presentation/i18n/constants';
import { createI18n } from '@presentation/i18n/createI18n';
import { I18nProvider } from '@presentation/i18n/I18nProvider';
import { PlaceholderScreen } from '@presentation/screens/PlaceholderScreen';

// The screen is rendered with the real i18n stack. Expectations are translation keys resolved by a
// real instance in the same language, never copies of the sentences.

function renderIn(language: SupportedLanguage) {
  return render(
    <I18nProvider language={language}>
      <PlaceholderScreen />
    </I18nProvider>,
  );
}

describe('PlaceholderScreen', () => {
  it.each(SUPPORTED_LANGUAGES)('renders the app name and the message in %s', (language) => {
    const { t } = createI18n(language);

    renderIn(language);

    expect(screen.getByRole('header', { name: t('app.name') })).toBeTruthy();
    expect(screen.getByText(t('placeholder.message'))).toBeTruthy();
  });

  it('renders in French, and not in English, when the language is French', () => {
    const english = createI18n('en');
    const french = createI18n('fr');
    expect(french.t('placeholder.message')).not.toBe(english.t('placeholder.message'));

    renderIn('fr');

    expect(screen.getByText(french.t('placeholder.message'))).toBeTruthy();
    expect(screen.queryByText(english.t('placeholder.message'))).toBeNull();
  });

  it('follows the device language when none is forced', () => {
    const { t } = createI18n('en');

    render(
      <I18nProvider>
        <PlaceholderScreen />
      </I18nProvider>,
    );

    expect(screen.getByText(t('placeholder.message'))).toBeTruthy();
  });
});
