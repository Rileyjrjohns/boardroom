import { fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, ActivityIndicator, Platform } from 'react-native';

import { Button } from './Button';

// The smallest size of anything that can be tapped, in points: 44 on iOS, and about 48 density
// independent pixels on Android. The number is written here on purpose, so that changing the
// token is a decision someone reads in a test.
const MINIMUM_TOUCH_SIZE = 44;

const TITLE = 'Try again';
const HINT = 'Opens it';

describe('Button', () => {
  it('is a button with a visible text that calls back when pressed', () => {
    const onPress = jest.fn();
    render(<Button title={TITLE} onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: TITLE }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is at least as big as the smallest touch target', () => {
    render(<Button title={TITLE} onPress={jest.fn()} />);

    expect(screen.getByRole('button')).toHaveStyle({
      minHeight: MINIMUM_TOUCH_SIZE,
      minWidth: MINIMUM_TOUCH_SIZE,
    });
  });
});

describe('Button, in every state', () => {
  it('is available, and not busy, by default', () => {
    render(<Button title={TITLE} onPress={jest.fn()} />);

    expect(screen.getByRole('button').props.accessibilityState).toEqual({
      disabled: false,
      busy: false,
    });
  });

  it('cannot be pressed when it is disabled, and says so', () => {
    const onPress = jest.fn();
    render(<Button title={TITLE} onPress={onPress} disabled />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('cannot be pressed when it is busy, shows a spinner, and says it is busy', () => {
    const onPress = jest.fn();
    render(<Button title={TITLE} onPress={onPress} busy />);

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('shows no spinner when it is not busy', () => {
    render(<Button title={TITLE} onPress={jest.fn()} />);

    expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull();
  });

  it('announces its text on iOS when it becomes busy, so that the action is not silent', () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    announce.mockClear();
    const { rerender } = render(<Button title={TITLE} onPress={jest.fn()} />);
    expect(announce).not.toHaveBeenCalled();

    rerender(<Button title={TITLE} onPress={jest.fn()} busy />);

    expect(announce).toHaveBeenCalledWith(TITLE);
    jest.restoreAllMocks();
  });

  it('carries the hint it is given', () => {
    render(<Button title={TITLE} onPress={jest.fn()} accessibilityHint={HINT} />);

    expect(screen.getByRole('button').props.accessibilityHint).toBe(HINT);
  });

  it.each(['primary', 'secondary', 'danger'] as const)(
    'keeps the size of a touch target as %s',
    (variant) => {
      render(<Button title={TITLE} onPress={jest.fn()} variant={variant} />);

      expect(screen.getByRole('button')).toHaveStyle({ minHeight: 44, minWidth: 44 });
    },
  );
});
