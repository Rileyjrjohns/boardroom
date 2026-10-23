import { render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AuthServicesProvider, useAuthServices } from './AuthServices';
import type { AuthServices } from './AuthServices';

const UNUSED = { execute: () => Promise.reject(new Error('unused')) };

const SERVICES: AuthServices = {
  restoreSession: UNUSED,
  signIn: UNUSED,
  signOut: UNUSED,
  evaluateAppLock: UNUSED,
  unlockApp: UNUSED,
  getCurrentUser: UNUSED,
};

describe('AuthServicesProvider', () => {
  it('provides the use cases of the feature to the hooks below it', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <AuthServicesProvider services={SERVICES}>{children}</AuthServicesProvider>
    );

    const { result } = renderHook(() => useAuthServices(), { wrapper });

    expect(result.current).toBe(SERVICES);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useAuthServices();
      return null;
    }

    expect(() => render(<Probe />)).toThrow('AuthServicesProvider');

    error.mockRestore();
  });
});
