import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { TEST_IDS } from '../testIds';
import { resetSecureViewStub, secureViewStub } from '../testing/screenProtectionSecureViewStub';

import { SecureContent } from './SecureContent';

// The component that mounts the secure view of the native module, the one file of the presentation
// that imports it. Jest gives it the stub of `testing/screenProtectionSecureViewStub.tsx`, which
// renders the children in a plain view and records the `secure` prop: what is checked is that the
// children are rendered, whether or not they are secure, and that the flag reaches the view. What a
// capture shows can only be seen on a device.

const CHILD = 'a page of a document';

beforeEach(() => {
  resetSecureViewStub();
});

describe('SecureContent', () => {
  it.each([true, false])('renders its children, with secure=%s', (secure) => {
    render(
      <SecureContent secure={secure}>
        <Text>{CHILD}</Text>
      </SecureContent>,
    );

    expect(screen.getByText(CHILD)).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.documentSecureContent)).toBeTruthy();
  });

  it.each([true, false])('tells the view whether the content is secure: %s', (secure) => {
    render(
      <SecureContent secure={secure}>
        <Text>{CHILD}</Text>
      </SecureContent>,
    );

    expect(secureViewStub.latest).toBe(secure);
  });

  it('follows the flag when it changes', () => {
    const { rerender } = render(
      <SecureContent secure={false}>
        <Text>{CHILD}</Text>
      </SecureContent>,
    );
    expect(secureViewStub.latest).toBe(false);

    rerender(
      <SecureContent secure>
        <Text>{CHILD}</Text>
      </SecureContent>,
    );

    expect(secureViewStub.latest).toBe(true);
    expect(screen.getByText(CHILD)).toBeTruthy();
  });
});
