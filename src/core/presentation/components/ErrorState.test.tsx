import { fireEvent, screen } from '@testing-library/react-native';

import { isRetryableCode } from '@composition/glue/retryableCodes';
import { renderScreen } from '@testing/presentation/renderScreen';

import { MEETINGS_ERROR_KEYS } from '@features/meetings/presentation/i18n/meetingMessageKeys';
import type { MeetingsErrorCode } from '@features/meetings/presentation/i18n/meetingMessageKeys';

import { ErrorState } from './ErrorState';

const CODES = Object.keys(MEETINGS_ERROR_KEYS) as MeetingsErrorCode[];

describe('ErrorState', () => {
  it.each(CODES)('shows the message of the error %s as an alert', (code) => {
    const { t } = renderScreen(<ErrorState code={code} onRetry={jest.fn()} />);

    expect(screen.getByText(t(MEETINGS_ERROR_KEYS[code]))).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it.each(CODES)('offers a retry for %s only when trying again can help', (code) => {
    const onRetry = jest.fn();
    const { t } = renderScreen(<ErrorState code={code} onRetry={onRetry} />);

    const retry = screen.queryByRole('button', { name: t('states.retry') });

    expect(retry !== null).toBe(isRetryableCode(code));
    if (retry !== null) {
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });

  it('tells the French user, in French, that the session is over', () => {
    renderScreen(<ErrorState code="unauthorized" onRetry={jest.fn()} />, { language: 'fr' });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Votre session n’est plus valide. Reconnectez-vous.',
    );
  });
});
