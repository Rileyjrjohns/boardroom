import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

// Test support, not production code: what Jest gives the "ui" project when `SecureContent` imports
// the local native module `modules/screen-protection` (see `jest.config.js`). The real view is a
// native component that needs a phone. This one renders its children in a plain view, like the
// module does on a platform without the native view, and records the `secure` prop it was last
// given, so that a test sees whether a document was put in the secure container.

interface SecureViewStubProps {
  readonly secure: boolean;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

interface SecureViewStubState {
  /** The `secure` prop of the view as it was last rendered; `undefined` when none was rendered. */
  latest: boolean | undefined;
}

export const secureViewStub: SecureViewStubState = { latest: undefined };

export function resetSecureViewStub(): void {
  secureViewStub.latest = undefined;
}

export function ScreenProtectionSecureView({ secure, children, testID }: SecureViewStubProps) {
  // After each render, so that a test sees the prop the view has now.
  useEffect(() => {
    secureViewStub.latest = secure;
  });
  useEffect(() => {
    return () => {
      secureViewStub.latest = undefined;
    };
  }, []);
  return <View testID={testID}>{children}</View>;
}
