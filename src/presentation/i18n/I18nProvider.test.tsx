import { act, render, screen } from '@testing-library/react-native';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import type { SupportedLanguage } from './constants';
import { I18nProvider } from './I18nProvider';
import { en } from './resources/en';
import { fr } from './resources/fr';
import { setDeviceLanguages } from './testing/setDeviceLanguages';

function Message() {
  const { t } = useTranslation();
  return <Text>{t('placeholder.message')}</Text>;
}

function provider(language?: SupportedLanguage) {
  return (
    <I18nProvider {...(language === undefined ? {} : { language })}>
      <Message />
    </I18nProvider>
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('I18nProvider', () => {
  it('follows the device language', () => {
    render(provider());

    expect(screen.getByText(en.placeholder.message)).toBeTruthy();
  });

  it('translates in French on a French device', () => {
    setDeviceLanguages('fr-CA');

    render(provider());

    expect(screen.getByText(fr.placeholder.message)).toBeTruthy();
  });

  it('falls back to English on a device in an unsupported language', () => {
    setDeviceLanguages('de-DE', 'ja-JP');

    render(provider());

    expect(screen.getByText(en.placeholder.message)).toBeTruthy();
  });

  it('lets a forced language win over the device language', () => {
    setDeviceLanguages('fr-FR');

    render(provider('en'));

    expect(screen.getByText(en.placeholder.message)).toBeTruthy();
  });

  it('follows the device when its language changes', async () => {
    setDeviceLanguages('en-US');
    const { rerender } = render(provider());
    expect(screen.getByText(en.placeholder.message)).toBeTruthy();

    setDeviceLanguages('fr-FR');
    // i18next applies the new language asynchronously, so the update is awaited.
    await act(async () => {
      rerender(provider());
    });

    expect(screen.getByText(fr.placeholder.message)).toBeTruthy();
    expect(screen.queryByText(en.placeholder.message)).toBeNull();
  });
});
