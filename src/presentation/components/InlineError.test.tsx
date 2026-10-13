import { fireEvent, screen } from '@testing-library/react-native';

import { MEETINGS_ERROR_KEYS } from '../i18n/translationKeys';
import type { MeetingsErrorCode } from '../i18n/translationKeys';
import { isRetryableCode } from '../query/retryPolicy';
import { renderScreen } from '../testing/renderScreen';

import { InlineError } from './InlineError';

const CODES = Object.keys(MEETINGS_ERROR_KEYS) as MeetingsErrorCode[];

describe('InlineError', () => {
  it.each(CODES)('says what the error %s is, with the text of its own', (code) => {
    const { t } = renderScreen(<InlineError code={code} onRetry={jest.fn()} />);

    expect(screen.getByText(t(MEETINGS_ERROR_KEYS[code]))).toBeTruthy();
  });

  it.each(CODES)('offers a retry for %s only when trying again can help', (code) => {
    const onRetry = jest.fn();
    const { t } = renderScreen(<InlineError code={code} onRetry={onRetry} />);

    const retry = screen.queryByRole('button', { name: t('states.retry') });

    expect(retry !== null).toBe(isRetryableCode(code));
    if (retry !== null) {
      fireEvent.press(retry);
      expect(onRetry).toHaveBeenCalledTimes(1);
    }
  });

  it('offers no retry when it is given none to call', () => {
    renderScreen(<InlineError code="networkUnavailable" />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
