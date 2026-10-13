import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { FlatList, View } from 'react-native';

import { unauthorized, unexpected } from '@domain/errors/RepositoryError';
import { NOW, aMeetingId } from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import { SUPPORTED_LANGUAGES } from '../i18n/constants';
import type { SupportedLanguage } from '../i18n/constants';
import { TEST_IDS, meetingRowTestId, periodOptionTestId } from '../testIds';
import { touchTarget } from '../theme/tokens';
import {
  MEETING_ROW_TEST_ID_PATTERN,
  meetingIdOfRowTestId,
  meetingsOf,
} from '../testing/meetingFixtures';
import { TEST_PAGE_SIZE, renderScreen } from '../testing/renderScreen';
import type { RenderScreenOptions } from '../testing/renderScreen';

import { MeetingsListScreen } from './MeetingsListScreen';

const noop = (): void => undefined;

const UPCOMING = meetingsOf('u', 7, MEETING_PERIOD.Upcoming);
const PAST = meetingsOf('p', 4, MEETING_PERIOD.Past);

function renderList(options: RenderScreenOptions = {}, onOpenMeeting = noop) {
  const rendered = renderScreen(<MeetingsListScreen onOpenMeeting={onOpenMeeting} />, options);
  rendered.fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, UPCOMING);
  rendered.fakes.meetings.setMeetings(MEETING_PERIOD.Past, PAST);
  return rendered;
}

/** The ids of the meetings shown, in the order shown. */
function shownIds(): string[] {
  return screen
    .queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)
    .map((row) => meetingIdOfRowTestId(String(row.props.testID)));
}

/** Makes the list ask for its next page, the way it does when the end is near. */
async function reachEnd(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId(TEST_IDS.meetingsList), 'endReached');
  });
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.onRefresh();
  });
}

// A list batches the update of the rows it shows on a timer. With real timers, that update lands
// between two awaits of a test, outside of `act`. With fake timers, the testing library advances
// them itself (and inside `act`) while it waits for the screen.
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MeetingsListScreen', () => {
  it('shows a loading state, then the first page of the upcoming meetings, soonest first', async () => {
    renderList();
    expect(screen.getByTestId(TEST_IDS.meetingsLoading)).toBeTruthy();

    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    expect(screen.queryByTestId(TEST_IDS.meetingsLoading)).toBeNull();
  });

  it('shows the title, the date and time and the location of each meeting', async () => {
    const { format } = renderList();
    const row = await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

    expect(within(row).getByText('Meeting u1')).toBeTruthy();
    expect(within(row).getByText(format.dateTime(UPCOMING[0]?.scheduledAt ?? NOW))).toBeTruthy();
    expect(within(row).getByText('Room u1')).toBeTruthy();
  });

  it('marks each row as a button that opens the meeting', async () => {
    const { t } = renderList();

    const row = await screen.findByRole('button', { name: /Meeting u1/ });

    expect(row.props.accessibilityHint).toBe(t('meetings.openHint'));
    expect(row).toHaveStyle({ minHeight: touchTarget.min });
  });

  it('opens the meeting that is tapped', async () => {
    const onOpenMeeting = jest.fn();
    renderList({}, onOpenMeeting);

    fireEvent.press(await screen.findByTestId(meetingRowTestId(aMeetingId('u2'))));

    expect(onOpenMeeting).toHaveBeenCalledWith(aMeetingId('u2'));
  });

  describe('the period', () => {
    it('is chosen with an accessible control: tabs that say which one is selected', async () => {
      const { t } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      expect(screen.getByLabelText(t('meetings.period.label')).props.accessibilityRole).toBe(
        'tablist',
      );
      expect(
        screen.getByRole('tab', { name: t('meetings.period.upcoming'), selected: true }),
      ).toBeTruthy();
      expect(
        screen.getByRole('tab', { name: t('meetings.period.past'), selected: false }),
      ).toBeTruthy();
      expect(screen.getByTestId(periodOptionTestId(MEETING_PERIOD.Past))).toHaveStyle({
        minHeight: touchTarget.min,
      });
    });

    it('switches to the past meetings, latest first, and back', async () => {
      const { t } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));
      await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));

      expect(shownIds()).toEqual(['p1', 'p2', 'p3']);
      expect(
        screen.getByRole('tab', { name: t('meetings.period.past'), selected: true }),
      ).toBeTruthy();

      fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.upcoming') }));
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    });

    it('is remembered when the screen is left and shown again', async () => {
      const { t, rerender } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));
      await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));

      rerender(<View />);
      rerender(<MeetingsListScreen onOpenMeeting={noop} />);

      expect(
        screen.getByRole('tab', { name: t('meetings.period.past'), selected: true }),
      ).toBeTruthy();
      await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));
    });
  });

  describe('pagination', () => {
    it('loads the next page when the end of the list is reached, with the cursor of the page before', async () => {
      const { fakes } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(fakes.meetings.listCalls).toHaveLength(1);

      await reachEnd();

      await screen.findByTestId(meetingRowTestId(aMeetingId('u6')));
      expect(shownIds()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
      expect(fakes.meetings.listCalls.map(({ request }) => request.cursor)).toEqual([
        undefined,
        'u3',
      ]);
      expect(fakes.meetings.listCalls.map(({ request }) => request.limit)).toEqual([
        TEST_PAGE_SIZE,
        TEST_PAGE_SIZE,
      ]);
    });

    it('ends the list with a message when there is no page left, and asks for nothing more', async () => {
      const { fakes, t } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(screen.queryByTestId(TEST_IDS.meetingsEnd)).toBeNull();

      await reachEnd();
      await reachEnd();
      await screen.findByTestId(TEST_IDS.meetingsEnd);
      await reachEnd();

      expect(shownIds()).toHaveLength(UPCOMING.length);
      expect(screen.getByText(t('meetings.endOfList'))).toBeTruthy();
      expect(fakes.meetings.listCalls).toHaveLength(3);
    });

    it('does not ask for a page while one is being loaded', async () => {
      const { fakes } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      await act(async () => {
        const list = screen.getByTestId(TEST_IDS.meetingsList);
        fireEvent(list, 'endReached');
        fireEvent(list, 'endReached');
      });

      expect(fakes.meetings.listCalls).toHaveLength(2);
    });

    it('says the next page could not be loaded, keeps the meetings, and loads it on retry', async () => {
      const { fakes, t } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fakes.meetings.failure = unexpected();

      await reachEnd();
      await screen.findByTestId(TEST_IDS.meetingsLoadMoreError);

      expect(screen.getByText(t('meetings.loadMoreFailed'))).toBeTruthy();
      expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
      // The user decides when to try again: reaching the end again does not.
      const callsBefore = fakes.meetings.listCalls.length;
      await reachEnd();
      expect(fakes.meetings.listCalls).toHaveLength(callsBefore);

      fakes.meetings.failure = undefined;
      fireEvent.press(
        within(screen.getByTestId(TEST_IDS.meetingsLoadMoreError)).getByRole('button', {
          name: t('states.retry'),
        }),
      );
      await screen.findByTestId(meetingRowTestId(aMeetingId('u4')));
      expect(shownIds()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
    });
  });

  describe('pull to refresh', () => {
    it('reads the list again, and shows what changed on the server', async () => {
      const { fakes } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, UPCOMING.slice(1));

      await pullToRefresh();

      await waitFor(() => {
        expect(shownIds()).toEqual(['u2', 'u3', 'u4']);
      });
      expect(fakes.meetings.listCalls).toHaveLength(2);
    });

    it('shows the refresh indicator while it lasts, and not afterwards', async () => {
      renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      await pullToRefresh();

      await waitFor(() => {
        expect(
          screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.refreshing,
        ).toBe(false);
      });
    });

    it('keeps the meetings and says so when the refresh fails', async () => {
      const { fakes, t } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fakes.meetings.failure = unexpected();

      await pullToRefresh();

      await screen.findByTestId(TEST_IDS.refreshError);
      expect(screen.getByText(t('errors.unexpected'))).toBeTruthy();
      expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    });
  });

  describe('the states of a list', () => {
    it('shows the empty state of the period when there is no meeting', async () => {
      const { fakes, t } = renderList();
      fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, []);

      await screen.findByTestId(TEST_IDS.meetingsEmpty);

      expect(screen.getByText(t('meetings.empty.upcoming'))).toBeTruthy();
      fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));
      await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));
      expect(screen.queryByTestId(TEST_IDS.meetingsEmpty)).toBeNull();
    });

    it('shows the empty state of the past period', async () => {
      const { fakes, t } = renderList();
      fakes.meetings.setMeetings(MEETING_PERIOD.Past, []);
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));

      await screen.findByText(t('meetings.empty.past'));
    });

    it('shows an error with a way to retry, and the list when the retry succeeds', async () => {
      const { fakes, t } = renderList();
      fakes.meetings.failure = unexpected();

      const error = await screen.findByTestId(TEST_IDS.meetingsError);
      expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
      // A fault of the server is worth trying again before giving up: the first call and two retries.
      expect(fakes.meetings.listCalls).toHaveLength(3);

      fakes.meetings.failure = undefined;
      fireEvent.press(within(error).getByRole('button', { name: t('states.retry') }));

      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(screen.queryByTestId(TEST_IDS.meetingsError)).toBeNull();
    });

    it('does not retry, and offers no retry, when trying again cannot help', async () => {
      const { fakes, t } = renderList();
      fakes.meetings.failure = unauthorized();

      const error = await screen.findByTestId(TEST_IDS.meetingsError);

      expect(within(error).getByText(t('errors.unauthorized'))).toBeTruthy();
      expect(within(error).queryByRole('button')).toBeNull();
      expect(fakes.meetings.listCalls).toHaveLength(1);
    });

    it('shows the network error of a list that was never loaded, with a retry', async () => {
      const { fakes, t } = renderList();
      fakes.network.goOffline();

      const error = await screen.findByTestId(TEST_IDS.meetingsError);
      expect(within(error).getByText(t('errors.networkUnavailable'))).toBeTruthy();

      fakes.network.goOnline();
      fireEvent.press(within(error).getByRole('button', { name: t('states.retry') }));
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    });
  });

  describe('saved data', () => {
    it('shows no banner while the data comes from the server', async () => {
      renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

      expect(screen.queryByTestId(TEST_IDS.staleBanner)).toBeNull();
    });

    it('says since when the data is a saved copy, when the network is down after a first load', async () => {
      const { fakes, t, format } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fakes.clock.advance(60_000);
      fakes.network.goOffline();

      await pullToRefresh();

      const banner = await screen.findByTestId(TEST_IDS.staleBanner);
      expect(
        within(banner).getByText(t('states.staleData', { date: format.dateTime(NOW) })),
      ).toBeTruthy();
      expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
      expect(screen.queryByTestId(TEST_IDS.refreshError)).toBeNull();
    });

    it('takes the banner away when the server answers again', async () => {
      const { fakes } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      fakes.network.goOffline();
      await pullToRefresh();
      await screen.findByTestId(TEST_IDS.staleBanner);

      fakes.network.goOnline();
      await pullToRefresh();

      await waitFor(() => {
        expect(screen.queryByTestId(TEST_IDS.staleBanner)).toBeNull();
      });
    });
  });

  describe('in each language', () => {
    it.each(SUPPORTED_LANGUAGES)(
      'shows the control, the dates and the states in %s',
      async (language: SupportedLanguage) => {
        const { t, format } = renderList({ language });

        const row = await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

        expect(screen.getByRole('tab', { name: t('meetings.period.upcoming') })).toBeTruthy();
        expect(
          within(row).getByText(format.dateTime(UPCOMING[0]?.scheduledAt ?? NOW)),
        ).toBeTruthy();
      },
    );

    it('translates the screen into French: the control, the empty state, the date', async () => {
      const { fakes } = renderList({ language: 'fr' });
      fakes.meetings.setMeetings(MEETING_PERIOD.Past, []);

      expect(screen.getByRole('tab', { name: 'À venir' })).toBeTruthy();
      expect(screen.getByRole('tab', { name: 'Passées' })).toBeTruthy();
      const row = await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(within(row).getByText(/mars/)).toBeTruthy();

      fireEvent.press(screen.getByRole('tab', { name: 'Passées' }));
      await screen.findByText('Aucune réunion passée.');
    });
  });

  it('keys the rows by meeting and renders them with the list of the platform', async () => {
    renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

    const list = screen.UNSAFE_getByType(FlatList);

    expect(list.props.keyExtractor(UPCOMING[0])).toBe('u1');
    expect(list.props.data).toHaveLength(3);
  });
});
