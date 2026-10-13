import { useQueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { useUiStore } from '../state/uiStore';

import { AppProviders } from './AppProviders';
import { useAppServices } from './AppServices';
import type { AppServices } from './AppServices';

const SERVICES: AppServices = {
  useCases: {
    listMeetings: { execute: () => Promise.reject(new Error('unused')) },
    getMeeting: { execute: () => Promise.reject(new Error('unused')) },
  },
  settings: { meetingsPageSize: 12 },
};

const clients: unknown[] = [];

/** Reads the three things the providers give, and records the query client it got. */
function Probe({ name }: { readonly name: string }) {
  const { settings } = useAppServices();
  const client = useQueryClient();
  const period = useUiStore((state) => state.meetingsPeriod);
  const select = useUiStore((state) => state.selectMeetingsPeriod);
  clients.push(client);
  const text = `${name}: ${settings.meetingsPageSize} ${period}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={name}
      onPress={() => {
        select(MEETING_PERIOD.Past);
      }}
    >
      <Text>{text}</Text>
    </Pressable>
  );
}

beforeEach(() => {
  clients.length = 0;
});

describe('AppProviders', () => {
  it('provides the services, a query client and the interface store to the tree', () => {
    render(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    expect(screen.getByText('a: 12 upcoming')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('a'));
    expect(screen.getByText('a: 12 past')).toBeTruthy();
  });

  it('keeps the same query client when it is rendered again', () => {
    const { rerender } = render(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    rerender(
      <AppProviders services={SERVICES}>
        <Probe name="a" />
      </AppProviders>,
    );

    expect(new Set(clients).size).toBe(1);
  });

  it('gives each instance of the app its own query client and its own store', () => {
    render(
      <>
        <AppProviders services={SERVICES}>
          <Probe name="a" />
        </AppProviders>
        <AppProviders services={SERVICES}>
          <Probe name="b" />
        </AppProviders>
      </>,
    );

    fireEvent.press(screen.getByLabelText('a'));

    expect(new Set(clients).size).toBe(2);
    expect(screen.getByText('b: 12 upcoming')).toBeTruthy();
  });
});
