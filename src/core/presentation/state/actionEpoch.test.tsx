import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ActionEpochProvider, useActionEpoch } from './actionEpoch';

describe('useActionEpoch', () => {
  it('is a single epoch when nothing moves the user: there is no provider', () => {
    const { result } = renderHook(() => useActionEpoch());

    expect(result.current()).toBe(0);
  });

  it('reads the epoch the composition provides, at the moment an action starts', () => {
    let epoch = 3;
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <ActionEpochProvider read={() => epoch}>{children}</ActionEpochProvider>
    );

    const { result } = renderHook(() => useActionEpoch(), { wrapper });
    expect(result.current()).toBe(3);

    epoch = 4;
    expect(result.current()).toBe(4);
  });
});
