import { screen } from '@testing-library/react-native';

import { renderScreen } from '@testing/presentation/renderScreen';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { TEST_IDS } from '../testIds';

import { PrivacyCover } from './PrivacyCover';

describe('PrivacyCover', () => {
  it.each(SUPPORTED_LANGUAGES)('shows the name of the app and nothing else, in %s', (language) => {
    const { t } = renderScreen(<PrivacyCover />, { language });

    const cover = screen.getByTestId(TEST_IDS.privacyCover);

    expect(cover).toHaveTextContent('Boardroom');
    expect(cover).toHaveTextContent(t('app.name'));
    expect(cover.props.accessibilityLabel).toBe(t('privacy.hidden'));
  });

  it('fills the screen, so that nothing of what is under it is in the snapshot', () => {
    renderScreen(<PrivacyCover />);

    expect(screen.getByTestId(TEST_IDS.privacyCover)).toHaveStyle({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    });
  });

  it('is modal for the screen reader: what is under it is out of reach', () => {
    renderScreen(<PrivacyCover />);

    expect(screen.getByTestId(TEST_IDS.privacyCover).props.accessibilityViewIsModal).toBe(true);
  });
});
