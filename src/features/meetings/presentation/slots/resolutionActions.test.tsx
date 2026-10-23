import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Text } from 'react-native';

import { NOW, aMeeting, aResolution } from '@testing/domain/builders';

import { ResolutionActionsProvider, useResolutionActionsSlot } from './resolutionActions';
import type { ResolutionActionsSlot } from './resolutionActions';

// What a feature adds to the resolutions of a meeting is declared by the meetings and implemented
// elsewhere (the votes plug in at the composition). The screens that use the slot are tested in
// MeetingDetailScreen.slot.test.tsx, with a slot of their own that knows nothing of any vote.

const SLOT: ResolutionActionsSlot = {
  useMeetingActions: (meeting) => ({
    notice: <Text>{meeting.title}</Text>,
    renderResolutionActions: (resolution) => <Text>{resolution.title}</Text>,
  }),
};

describe('the slot of the resolution actions', () => {
  it('adds nothing when nothing is plugged into it: the meeting is display only', () => {
    const { result } = renderHook(() =>
      useResolutionActionsSlot().useMeetingActions(aMeeting(), NOW),
    );

    expect(result.current.notice).toBeNull();
    expect(result.current.renderResolutionActions(aResolution())).toBeUndefined();
  });

  it('gives what is plugged into it to the components below the provider', () => {
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <ResolutionActionsProvider slot={SLOT}>{children}</ResolutionActionsProvider>
    );

    const { result } = renderHook(() => useResolutionActionsSlot(), { wrapper });

    expect(result.current).toBe(SLOT);
  });
});
