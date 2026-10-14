import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef } from 'react';
import type { TextInput } from 'react-native';

import { TextField } from './TextField';

const LABEL = 'Email address';
const FIELD = 'field';
const ERROR = 'error';

describe('TextField', () => {
  it('has a visible label, which names the input for the screen reader', () => {
    render(<TextField label={LABEL} value="" onChangeText={jest.fn()} testID={FIELD} />);

    expect(screen.getByText(LABEL)).toBeTruthy();
    expect(screen.getByLabelText(LABEL)).toBe(screen.getByTestId(FIELD));
  });

  it('tells what is typed, and shows the value it is given', () => {
    const onChangeText = jest.fn();
    render(<TextField label={LABEL} value="a@b.fr" onChangeText={onChangeText} testID={FIELD} />);

    fireEvent.changeText(screen.getByTestId(FIELD), 'c@d.fr');

    expect(screen.getByTestId(FIELD).props.value).toBe('a@b.fr');
    expect(onChangeText).toHaveBeenCalledWith('c@d.fr');
  });

  it('shows its error under the field as an alert that is announced, and marks the field', () => {
    render(
      <TextField
        label={LABEL}
        value=""
        onChangeText={jest.fn()}
        error="Enter an email address."
        errorTestID={ERROR}
      />,
    );

    const error = screen.getByTestId(ERROR);

    expect(error).toHaveTextContent('Enter an email address.');
    expect(error.props.accessibilityRole).toBe('alert');
    expect(error.props.accessibilityLiveRegion).toBe('polite');
  });

  it('shows no error when it has none', () => {
    render(<TextField label={LABEL} value="" onChangeText={jest.fn()} errorTestID={ERROR} />);

    expect(screen.queryByTestId(ERROR)).toBeNull();
  });

  it('passes the keyboard and autofill hints on to the input, and is at least as tall as a touch target', () => {
    render(
      <TextField
        label={LABEL}
        value=""
        onChangeText={jest.fn()}
        testID={FIELD}
        keyboardType="email-address"
        autoComplete="username"
        textContentType="username"
        secureTextEntry
      />,
    );

    expect(screen.getByTestId(FIELD).props).toMatchObject({
      keyboardType: 'email-address',
      autoComplete: 'username',
      textContentType: 'username',
      secureTextEntry: true,
    });
    expect(screen.getByTestId(FIELD)).toHaveStyle({ minHeight: 44 });
  });

  it('can be frozen, and hands its input to a ref for the focus', () => {
    const ref = createRef<TextInput>();
    render(
      <TextField label={LABEL} value="" onChangeText={jest.fn()} editable={false} inputRef={ref} />,
    );

    expect(screen.getByLabelText(LABEL).props.editable).toBe(false);
    expect(ref.current).not.toBeNull();
  });
});
