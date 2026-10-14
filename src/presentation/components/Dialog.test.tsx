import { act, fireEvent, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Modal, Text } from 'react-native';

import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';

import { Button } from './Button';
import { Dialog } from './Dialog';

// The window that asks the user something. The confirmation of a vote and of a sign-out are built
// on it, and their own tests cover what they say; these cover what makes it a dialog.

const TITLE = 'Are you sure';
const BODY = 'The body of the dialog';
const YES = 'Yes';
const DIALOG = 'dialog';

function renderDialog(visible = true, onDismiss = jest.fn()) {
  const rendered = renderScreen(
    <Dialog
      visible={visible}
      title={TITLE}
      onDismiss={onDismiss}
      actions={<Button title={YES} onPress={jest.fn()} />}
      testID={DIALOG}
    >
      <Text>{BODY}</Text>
    </Dialog>,
  );
  return { ...rendered, onDismiss };
}

/** The platform mock of React Native already is a mock function: its calls are forgotten first. */
function spyOnFocus(): jest.SpyInstance {
  const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
  focus.mockClear();
  return focus;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Dialog', () => {
  it('shows its title as a header, its body and its actions', () => {
    renderDialog();

    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(screen.getByRole('button', { name: YES })).toBeTruthy();
  });

  it('shows nothing while it is not visible', () => {
    renderDialog(false);

    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('is modal for the screen reader, and puts the focus of the screen reader on its title', () => {
    const focus = spyOnFocus();

    renderDialog();

    expect(screen.getByTestId(DIALOG).props.accessibilityViewIsModal).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
  });

  it('does not move the focus when it is not shown', () => {
    const focus = spyOnFocus();

    renderDialog(false);

    expect(focus).not.toHaveBeenCalled();
  });

  it('asks to be dismissed when the system says back, and only then', () => {
    const { onDismiss } = renderDialog();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      screen.UNSAFE_getByType(Modal).props.onRequestClose();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  describe('while the app is not active', () => {
    it('shows the privacy cover in the place of what it says, which the snapshot of the app switcher would show', () => {
      const { uiStore } = renderDialog();

      act(() => {
        uiStore.getState().setPrivacyCover(true);
      });

      expect(screen.getByTestId(TEST_IDS.privacyCover)).toBeTruthy();
      expect(screen.queryByText(BODY)).toBeNull();
      expect(screen.queryByText(TITLE)).toBeNull();
    });

    it('shows its content again, as it was, when the app is back', () => {
      const { uiStore } = renderDialog();
      act(() => {
        uiStore.getState().setPrivacyCover(true);
      });

      act(() => {
        uiStore.getState().setPrivacyCover(false);
      });

      expect(screen.queryByTestId(TEST_IDS.privacyCover)).toBeNull();
      expect(screen.getByText(BODY)).toBeTruthy();
    });

    it('does not move the focus onto a title that is covered', () => {
      const { uiStore } = renderDialog(false);
      const focus = spyOnFocus();
      act(() => {
        uiStore.getState().setPrivacyCover(true);
      });

      expect(focus).not.toHaveBeenCalled();
      fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
    });
  });
});
