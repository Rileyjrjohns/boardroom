import { waitFor } from '@testing-library/react-native';

import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { renderScreenHook } from '@testing/presentation/renderScreen';

import { meetingsOf } from '../testing/meetingFixtures';

import { selectMeetingsListView } from './meetingPages';
import { useMeetingsList } from './useMeetingsList';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderListHook() {
  const rendered = renderScreenHook(() => useMeetingsList(MEETING_PERIOD.Upcoming));
  rendered.fakes.meetings.setMeetings(
    MEETING_PERIOD.Upcoming,
    meetingsOf('u', 2, MEETING_PERIOD.Upcoming),
  );
  return rendered;
}

describe('useMeetingsList', () => {
  it('hands the query the same function to build the view of the pages, at every render', async () => {
    const { result, rerender, queryClient } = renderListHook();
    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    const [query] = queryClient.getQueryCache().getAll();
    const [observer] = query?.observers ?? [];

    rerender({});
    rerender({});

    expect(observer?.options.select).toBe(selectMeetingsListView);
  });

  it('gives back the same view while the pages have not changed, instead of building it again', async () => {
    const { result, rerender } = renderListHook();
    await waitFor(() => {
      expect(result.current.data).toBeDefined();
    });
    const first = result.current.data;

    rerender({});
    rerender({});

    expect(result.current.data).toBe(first);
    expect(result.current.data?.meetings).toBe(first?.meetings);
  });
});
