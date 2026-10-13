import { screen } from '@testing-library/react-native';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';

import { StartupFailureScreen } from './StartupFailureScreen';

describe('StartupFailureScreen', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'says what is wrong and gives the technical code in %s',
    (language) => {
      const { t } = renderScreen(<StartupFailureScreen code="configurationNotAvailable" />, {
        language,
      });

      expect(screen.getByRole('header', { name: t('startup.title') })).toBeTruthy();
      expect(screen.getByText(t('startup.message'))).toBeTruthy();
      expect(
        screen.getByText(t('startup.code', { code: 'configurationNotAvailable' })),
      ).toBeTruthy();
      expect(screen.getByTestId(TEST_IDS.startupFailure)).toBeTruthy();
    },
  );

  it('is translated into French', () => {
    renderScreen(<StartupFailureScreen code="invalidAdaptersSetting" />, { language: 'fr' });

    expect(screen.getByRole('header', { name: 'Boardroom ne peut pas démarrer' })).toBeTruthy();
    expect(screen.getByText('Code technique : invalidAdaptersSetting')).toBeTruthy();
  });
});
