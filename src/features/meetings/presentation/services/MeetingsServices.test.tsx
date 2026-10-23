import { render, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { MeetingsServicesProvider, useMeetingsServices } from './MeetingsServices';
import type { MeetingsServices } from './MeetingsServices';

const UNUSED = { execute: () => Promise.reject(new Error('unused')) };

const SERVICES: MeetingsServices = {
  listMeetings: UNUSED,
  getMeeting: UNUSED,
  pageSize: 3,
};

describe('MeetingsServicesProvider', () => {
  it('provides the use cases of the feature to the hooks below it', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <MeetingsServicesProvider services={SERVICES}>{children}</MeetingsServicesProvider>
    );

    const { result } = renderHook(() => useMeetingsServices(), { wrapper });

    expect(result.current).toBe(SERVICES);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Probe() {
      useMeetingsServices();
      return null;
    }

    expect(() => render(<Probe />)).toThrow('MeetingsServicesProvider');

    error.mockRestore();
  });
});
