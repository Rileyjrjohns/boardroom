import { render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { VotesServicesProvider, useVotesServices } from './VotesServices';
import type { VotesServices } from './VotesServices';

const UNUSED = { execute: () => Promise.reject(new Error('unused')) };

const SERVICES: VotesServices = {
  castVote: UNUSED,
  syncPendingVotes: UNUSED,
  listPendingVotes: UNUSED,
  acknowledgeRejectedVote: UNUSED,
  discardUnreadableVotes: UNUSED,
};

describe('VotesServicesProvider', () => {
  it('provides the use cases of the feature to the hooks below it', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <VotesServicesProvider services={SERVICES}>{children}</VotesServicesProvider>
    );

    const { result } = renderHook(() => useVotesServices(), { wrapper });

    expect(result.current).toBe(SERVICES);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useVotesServices();
      return null;
    }

    expect(() => render(<Probe />)).toThrow('VotesServicesProvider');

    error.mockRestore();
  });
});
