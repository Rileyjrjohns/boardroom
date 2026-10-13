import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { UiStoreProvider, createUiStore, useUiStore } from './uiStore';

describe('createUiStore', () => {
  it('starts on the upcoming meetings', () => {
    expect(createUiStore().getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });

  it('selects a period', () => {
    const store = createUiStore();

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(store.getState().meetingsPeriod).toBe(MEETING_PERIOD.Past);
  });

  it('notifies its subscribers of a change', () => {
    const store = createUiStore();
    const periods: string[] = [];
    store.subscribe((state) => periods.push(state.meetingsPeriod));

    store.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(periods).toEqual([MEETING_PERIOD.Past]);
  });

  it('creates a new store at every call: no state is shared between two', () => {
    const first = createUiStore();
    const second = createUiStore();

    first.getState().selectMeetingsPeriod(MEETING_PERIOD.Past);

    expect(second.getState().meetingsPeriod).toBe(MEETING_PERIOD.Upcoming);
  });
});

const FIRST = 'a';
const SECOND = 'b';

function Period({ label }: { readonly label: string }) {
  const period = useUiStore((state) => state.meetingsPeriod);
  const select = useUiStore((state) => state.selectMeetingsPeriod);
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

describe('UiStoreProvider', () => {
  it('provides a store to the tree below, and re-renders it when the state changes', () => {
    render(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );
    expect(screen.getByText('a: upcoming')).toBeTruthy();

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
  });

  it('shares one store between the components below it', () => {
    render(
      <UiStoreProvider>
        <Period label={FIRST} />
        <Period label={SECOND} />
      </UiStoreProvider>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('b: past')).toBeTruthy();
  });

  it('gives each provider its own store, so that two apps never share state', () => {
    render(
      <>
        <UiStoreProvider>
          <Period label={FIRST} />
        </UiStoreProvider>
        <UiStoreProvider>
          <Period label={SECOND} />
        </UiStoreProvider>
      </>,
    );

    fireEvent.press(screen.getByLabelText(FIRST));

    expect(screen.getByText('a: past')).toBeTruthy();
    expect(screen.getByText('b: upcoming')).toBeTruthy();
  });

  it('keeps its store when the tree below it is rendered again', () => {
    const { rerender } = render(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );
    fireEvent.press(screen.getByLabelText(FIRST));

    rerender(
      <UiStoreProvider>
        <Period label={FIRST} />
      </UiStoreProvider>,
    );

    expect(screen.getByText('a: past')).toBeTruthy();
    act(() => undefined);
  });

  it('refuses to be read outside of a provider: that is a bug of the tree, not a state', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => render(<Period label={FIRST} />)).toThrow('UiStoreProvider');

    error.mockRestore();
  });
});
