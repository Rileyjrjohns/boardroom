import { render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';

import { REPOSITORY_ERROR_CODE } from '@core/domain/errors/RepositoryError';
import { NOW } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import { ErrorState } from './ErrorState';
import { InlineError } from './InlineError';
import { LiveText } from './LiveText';
import { LoadingState } from './LoadingState';
import { StatusBanner } from './StatusBanner';

// What the screen reader is told about the states that appear on their own: loading, an error, a
// notice that the data is a saved copy. A live region does it on Android, an announcement on iOS.
// Not verified with VoiceOver or TalkBack: these tests check what is asked of the platform.

const MESSAGE = 'Something happened';
const FIRST = 'First';
const SECOND = 'Second';
const LOADING = 'Loading meetings';

afterEach(() => {
  jest.restoreAllMocks();
});

function onPlatform(os: 'ios' | 'android'): jest.SpyInstance {
  jest.replaceProperty(Platform, 'OS', os);
  // The platform mock of React Native already is a mock function: its calls are forgotten first.
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  announce.mockClear();
  return announce;
}

describe('LiveText', () => {
  it('is an alert and a polite live region, which is how Android reads a text that shows up', () => {
    onPlatform('android');
    render(<LiveText message={MESSAGE} />);

    const text = screen.getByRole('alert');

    expect(text.props.accessibilityLiveRegion).toBe('polite');
    expect(text).toHaveTextContent(MESSAGE);
  });

  it('is announced on iOS, once, when it appears', () => {
    const announce = onPlatform('ios');

    const { rerender } = render(<LiveText message={MESSAGE} />);
    rerender(<LiveText message={MESSAGE} />);

    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(MESSAGE);
  });

  it('is announced again on iOS when its text changes', () => {
    const announce = onPlatform('ios');
    const { rerender } = render(<LiveText message={FIRST} />);

    rerender(<LiveText message={SECOND} />);

    expect(announce.mock.calls).toEqual([[FIRST], [SECOND]]);
  });

  it('is not announced on Android, where the live region does it: it would be said twice', () => {
    const announce = onPlatform('android');

    render(<LiveText message={MESSAGE} />);

    expect(announce).not.toHaveBeenCalled();
  });
});

describe('LoadingState', () => {
  it('is a busy progress bar that carries what it waits for', () => {
    onPlatform('android');
    render(<LoadingState accessibilityLabel={LOADING} />);

    const progress = screen.getByRole('progressbar', { name: LOADING });

    expect(progress.props.accessible).toBe(true);
    expect(progress.props.accessibilityState).toEqual({ busy: true });
    expect(progress.props.accessibilityLiveRegion).toBe('polite');
  });

  it('announces what it waits for on iOS', () => {
    const announce = onPlatform('ios');

    render(<LoadingState accessibilityLabel={LOADING} />);

    expect(announce).toHaveBeenCalledWith(LOADING);
  });
});

describe('the notice that the data is a saved copy', () => {
  it('is an alert and a live region, in each language', () => {
    onPlatform('android');
    const { t, format } = renderScreen(<StatusBanner staleSince={NOW} />);

    const alert = screen.getByRole('alert');

    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(alert).toHaveTextContent(t('states.staleData', { date: format.dateTime(NOW) }));
  });

  it('is announced on iOS', () => {
    const announce = onPlatform('ios');
    const { t, format } = renderScreen(<StatusBanner staleSince={NOW} />);

    expect(announce).toHaveBeenCalledWith(t('states.staleData', { date: format.dateTime(NOW) }));
  });
});

describe('an error', () => {
  const code = REPOSITORY_ERROR_CODE.NetworkUnavailable;

  it('shown in place of content is an alert and a live region', () => {
    onPlatform('android');
    const { t } = renderScreen(<ErrorState code={code} onRetry={jest.fn()} />);

    const alert = screen.getByRole('alert');

    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(alert).toHaveTextContent(t('errors.networkUnavailable'));
  });

  it('shown next to content is an alert and a live region', () => {
    onPlatform('android');
    const { t } = renderScreen(<InlineError code={code} onRetry={jest.fn()} />);

    const alert = screen.getByRole('alert');

    expect(alert.props.accessibilityLiveRegion).toBe('polite');
    expect(alert).toHaveTextContent(t('errors.networkUnavailable'));
  });

  it.each([
    ['in place of content', <ErrorState key="e" code={code} onRetry={jest.fn()} />],
    ['next to content', <InlineError key="i" code={code} onRetry={jest.fn()} />],
  ])('is announced on iOS, %s', (_where, ui) => {
    const announce = onPlatform('ios');
    const { t } = renderScreen(ui);

    expect(announce).toHaveBeenCalledWith(t('errors.networkUnavailable'));
  });
});
