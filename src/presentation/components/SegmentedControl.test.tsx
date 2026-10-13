import { fireEvent, render, screen } from '@testing-library/react-native';

import { touchTarget } from '../theme/tokens';

import { SegmentedControl } from './SegmentedControl';

const GROUP_LABEL = 'Pick';

const OPTIONS = [
  { value: 'one', label: 'First' },
  { value: 'two', label: 'Second' },
] as const;

describe('SegmentedControl', () => {
  it('is a group of tabs, named, and says which one is selected', () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="two"
        onChange={jest.fn()}
        accessibilityLabel={GROUP_LABEL}
      />,
    );

    expect(screen.getByLabelText(GROUP_LABEL).props.accessibilityRole).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'First', selected: false })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Second', selected: true })).toBeTruthy();
  });

  it('calls onChange with the value of the segment that is tapped', () => {
    const onChange = jest.fn();
    render(
      <SegmentedControl
        options={OPTIONS}
        value="one"
        onChange={onChange}
        accessibilityLabel={GROUP_LABEL}
      />,
    );

    fireEvent.press(screen.getByRole('tab', { name: 'Second' }));

    expect(onChange).toHaveBeenCalledWith('two');
  });

  it('gives each segment at least the touch target the platforms ask for', () => {
    render(
      <SegmentedControl
        options={OPTIONS}
        value="one"
        onChange={jest.fn()}
        accessibilityLabel={GROUP_LABEL}
      />,
    );

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveStyle({ minHeight: touchTarget.min });
    }
  });
});
