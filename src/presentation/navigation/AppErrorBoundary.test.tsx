import { fireEvent, render, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import type { ReactElement } from 'react';
import { renderRouter } from 'expo-router/testing-library';

import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import { createI18n } from '../i18n/createI18n';
import { setDeviceLanguages } from '../i18n/testing/setDeviceLanguages';
import { TEST_IDS } from '../testIds';

import { AppErrorBoundary } from './AppErrorBoundary';

function LayoutWithBoundary(): ReactElement {
  return <Slot />;
}

/** A screen that fails while it renders. */
function FailingScreen(): ReactElement {
  throw new Error('boom');
}

afterEach(() => {
  // renderRouter switches to fake timers.
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('AppErrorBoundary', () => {
  it.each(SUPPORTED_LANGUAGES)(
    'says that something went wrong, in %s, with a button to try again',
    (language) => {
      setDeviceLanguages(language);
      const { t } = createI18n(language);
      const retry = jest.fn(() => Promise.resolve());

      render(<AppErrorBoundary error={new Error('boom')} retry={retry} />);

      expect(screen.getByTestId(TEST_IDS.errorBoundary)).toBeTruthy();
      expect(screen.getByText(t('errors.unexpected'))).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));
      expect(retry).toHaveBeenCalledTimes(1);
    },
  );

  it('does not show the error itself to the user', () => {
    render(<AppErrorBoundary error={new Error('secret detail')} retry={jest.fn()} />);

    expect(screen.queryByText(/secret detail/)).toBeNull();
  });

  describe('exported from a layout, the way expo-router expects', () => {
    it('replaces a screen that fails while it renders, instead of a blank screen', () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      setDeviceLanguages('fr');
      const { t } = createI18n('fr');

      renderRouter({
        _layout: { default: LayoutWithBoundary, ErrorBoundary: AppErrorBoundary },
        index: FailingScreen,
      });

      expect(screen.getByTestId(TEST_IDS.errorBoundary)).toBeTruthy();
      expect(screen.getByText(t('errors.unexpected'))).toBeTruthy();
    });
  });
});
