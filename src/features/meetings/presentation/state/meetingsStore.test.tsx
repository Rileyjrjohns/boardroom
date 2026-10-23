import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';

import { MeetingsStoreProvider, createMeetingsStore, useMeetingsStore } from './meetingsStore';

describe('createMeetingsStore', () => {
  it('starts on the upcoming meetings', () => {
    expect(createMeetingsStore().getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });

  it('selects a period', () => {
    const store = createMeetingsStore();

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(store.getState().meetingsPeriod).toBe(MEETING_PERIOD.Past);
  });

  it('notifies its subscribers of a change', () => {
    const store = createMeetingsStore();
    const periods: string[] = [];
    store.subscribe((state) => periods.push(state.meetingsPeriod));

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(periods).toEqual([MEETING_PERIOD.Past]);
  });

  it('creates a new store at every call: no state is shared between two', () => {
    const first = createMeetingsStore();
    const second = createMeetingsStore();

    first.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(second.getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });
});

const FIRST = 'a';
const SECOND = 'b';

function Period({ label }: { readonly label: string }) {
  const period = useMeetingsStore((state) => state.meetingsPeriod);
  const select = useMeetingsStore((state) => state.selectMeetingsPeriod);
  const text = `${label}: ${period}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        select(MEETING_PERIOD.Past);
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
}

describe('MeetingsStoreProvider', () => {
  it('provides a store to the tree below, and re-renders it when the state changes', () => {
    render(
      <MeetingsStoreProvider>
        <Period label={FIRST} />
      </MeetingsStoreProvider>,
    );
    expect(screen.getByText('a: upcoming')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
  });

  it('shares one store between the components below it', () => {
    render(
      <MeetingsStoreProvider>
        <Period label={FIRST} />
        <Period label={SECOND} />
      </MeetingsStoreProvider>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('b: past')).toBeTruthy();
  });

  it('provides the store it is given, so that what is outside React and what is inside see one', () => {
    const store = createMeetingsStore();
    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    render(
      <MeetingsStoreProvider store={store}>
        <Period label={FIRST} />
      </MeetingsStoreProvider>,
    );

    expect(screen.getByText('a: past')).toBeTruthy();
    act(() => {
      store.getState().selectMeetingsPeriod(MEETING_PERIOD.Upcoming);
    });
    expect(screen.getByText('a: upcoming')).toBeTruthy();
  });

  it('gives each provider its own store, so that two apps never share state', () => {
    render(
      <>
        <MeetingsStoreProvider>
          <Period label={FIRST} />
        </MeetingsStoreProvider>
        <MeetingsStoreProvider>
          <Period label={SECOND} />
        </MeetingsStoreProvider>
      </>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
    expect(screen.getByText('b: upcoming')).toBeTruthy();
  });

  it('keeps its store when the tree below it is rendered again', () => {
    const { rerender } = render(
      <MeetingsStoreProvider>
        <Period label={FIRST} />
      </MeetingsStoreProvider>,
    );
    fireEvent.press(screen.getByLabelText(FIRST));

    rerender(
      <MeetingsStoreProvider>
        <Period label={FIRST} />
      </MeetingsStoreProvider>,
    );

    expect(screen.getByText('a: past')).toBeTruthy();
    act(() => undefined);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree, not a state', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Period label={FIRST} />)).toThrow('MeetingsStoreProvider');

    error.mockRestore();
  });
});
