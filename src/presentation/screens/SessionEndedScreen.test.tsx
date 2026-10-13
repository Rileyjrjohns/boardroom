import { screen, within } from '@testing-library/react-native';

import { AUTHENTICATION_ERROR_CODE } from '@domain/errors/AuthenticationError';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';

import { SessionEndedScreen } from './SessionEndedScreen';

describe('SessionEndedScreen', () => {
  it.each(SUPPORTED_LANGUAGES)('says why the session is over, in %s', (language) => {
    const { t } = renderScreen(
      <SessionEndedScreen code={AUTHENTICATION_ERROR_CODE.SessionExpired} />,
      { language },
    );

    const ended = screen.getByTestId(TEST_IDS.sessionEnded);

    expect(within(ended).getByText(t('errors.sessionExpired'))).toBeTruthy();
  });

  it.each([
    REPOSITORY_ERROR_CODE.Unauthorized,
    AUTHENTICATION_ERROR_CODE.NotAuthenticated,
    AUTHENTICATION_ERROR_CODE.SessionExpired,
    AUTHENTICATION_ERROR_CODE.SessionChanged,
    AUTHENTICATION_ERROR_CODE.AppLocked,
  ])('offers nothing to retry for %s: asking again cannot bring the session back', (code) => {
    renderScreen(<SessionEndedScreen code={code} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
