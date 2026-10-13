import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './Button';

// The smallest size of anything that can be tapped, in points: 44 on iOS, and about 48 density
// independent pixels on Android. The number is written here on purpose, so that changing the
// token is a decision someone reads in a test.
const MINIMUM_TOUCH_SIZE = 44;

const TITLE = 'Try again';

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
