import { render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CoreServicesProvider, useCoreServices } from './CoreServices';
import type { CoreServices } from './CoreServices';

const NOTICES: NonNullable<CoreServices['notices']> = {
  localDataReset: true,
  acknowledgeLocalDataReset: () => Promise.resolve(),
};

describe('CoreServicesProvider', () => {
  it('provides the services of the shared components to the hooks below it', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <CoreServicesProvider services={{ notices: NOTICES }}>{children}</CoreServicesProvider>
    );

    const { result } = renderHook(() => useCoreServices(), { wrapper });

    expect(result.current.notices).toBe(NOTICES);
    expect(result.current.demoControls).toBeUndefined();
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useCoreServices();
      return null;
    }

    expect(() => render(<Probe />)).toThrow('CoreServicesProvider');

    error.mockRestore();
  });
});
