import { act, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { renderScreen } from '@testing/presentation/renderScreen';

import { Button } from './Button';
import { Dialog } from './Dialog';
import { DialogHost } from './DialogHost';
import { CORE_TEST_IDS } from '@core/presentation/testIds';

// What keeps the screen reader out of the content while something is over it. On Android that is a
// flag on the content (`no-hide-descendants`), and the dialogs have to be outside of what it hides.

const CONTENT = 'The meetings of the user';
const TITLE = 'Are you sure';
const BODY = 'The body of the dialog';
const YES = 'Yes';

function Screen({ open, body = BODY }: { readonly open: boolean; readonly body?: string }) {
  return (
    <>
      <Text>{CONTENT}</Text>
      <Dialog
        visible={open}
        title={TITLE}
        onDismiss={jest.fn()}
        actions={<Button title={YES} onPress={jest.fn()} />}
      >
        <Text>{body}</Text>
      </Dialog>
    </>
  );
}

function renderHosted(open: boolean, covered = false) {
  const rendered = renderScreen(
    <DialogHost covered={covered}>
      <Screen open={open} />
    </DialogHost>,
  );
  const rehost = (nextOpen: boolean, nextCovered = covered, body?: string) => {
    rendered.rerender(
      <DialogHost covered={nextCovered}>
        <Screen open={nextOpen} {...(body === undefined ? {} : { body })} />
      </DialogHost>,
    );
  };
  return { ...rendered, rehost };
}

const contentFlags = () => {
  const { props } = screen.getByTestId(CORE_TEST_IDS.appContent, { includeHiddenElements: true });
  return {
    android: props.importantForAccessibility,
    ios: props.accessibilityElementsHidden,
  };
};

describe('DialogHost', () => {
  it('leaves the content to the screen reader while nothing is over it', () => {
    renderHosted(false);

    expect(screen.getByText(CONTENT)).toBeTruthy();
    expect(contentFlags()).toEqual({ android: 'auto', ios: false });
  });

  it('hides the content from the screen reader, on Android and on iOS, while a dialog is open', () => {
    renderHosted(true);

    expect(contentFlags()).toEqual({ android: 'no-hide-descendants', ios: true });
    expect(screen.queryByText(CONTENT)).toBeNull();
    expect(screen.getByText(CONTENT, { includeHiddenElements: true })).toBeTruthy();
  });

  it('does not hide the dialog itself, which is not part of the content', () => {
    renderHosted(true);

    expect(screen.getByRole('header', { name: TITLE })).toBeTruthy();
    expect(screen.getByText(BODY)).toBeTruthy();
    expect(screen.getByRole('button', { name: YES })).toBeTruthy();
  });

  it('gives the content back when the dialog closes', () => {
    const { rehost } = renderHosted(true);

    rehost(false);

    expect(contentFlags()).toEqual({ android: 'auto', ios: false });
    expect(screen.getByText(CONTENT)).toBeTruthy();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('hides the content while the privacy cover is over it, with no dialog', () => {
    const { rehost } = renderHosted(false);

    rehost(false, true);

    expect(contentFlags()).toEqual({ android: 'no-hide-descendants', ios: true });
    expect(screen.queryByText(CONTENT)).toBeNull();
  });

  it('shows what the dialog says now, not what it said when it opened', () => {
    const { rehost } = renderHosted(true);

    rehost(true, false, 'Something went wrong');

    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.queryByText(BODY)).toBeNull();
  });

  it('forgets the dialog of a screen that is gone', () => {
    const { rerender } = renderHosted(true);

    act(() => {
      rerender(
        <DialogHost covered={false}>
          <Text>{CONTENT}</Text>
        </DialogHost>,
      );
    });

    expect(contentFlags()).toEqual({ android: 'auto', ios: false });
    expect(screen.queryByText(BODY)).toBeNull();
  });
});
