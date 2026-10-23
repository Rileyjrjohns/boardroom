import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { unexpected } from '@core/domain/errors/RepositoryError';
import { QUERY_STALE_TIME_MILLIS } from '@core/presentation/query/createQueryClient';
import { TEST_IDS, meetingRowTestId } from '@core/presentation/testIds';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import { aMeetingId } from '@testing/domain/builders';
import { renderScreen } from '@testing/presentation/renderScreen';

import {
  MEETING_ROW_TEST_ID_PATTERN,
  meetingIdOfRowTestId,
  meetingsOf,
} from '../testing/meetingFixtures';

import { MeetingsListScreen } from './MeetingsListScreen';

// The cache policy of the list as the user lives it: what a pull to refresh costs when several
// pages are loaded, what coming back to a period costs, and what one period's refresh looks like
// on the other.

const noop = (): void => undefined;

const UPCOMING = meetingsOf('u', 7, MEETING_PERIOD.Upcoming);
const PAST = meetingsOf('p', 4, MEETING_PERIOD.Past);

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderList() {
  const rendered = renderScreen(<MeetingsListScreen onOpenMeeting={noop} />);
  rendered.fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, UPCOMING);
  rendered.fakes.meetings.setMeetings(MEETING_PERIOD.Past, PAST);
  return rendered;
}

function shownIds(): string[] {
  return screen
    .queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)
    .map((row) => meetingIdOfRowTestId(String(row.props.testID)));
}

async function reachEnd(): Promise<void> {
  await act(async () => {
    fireEvent(screen.getByTestId(TEST_IDS.meetingsList), 'endReached');
  });
}

function refreshControl() {
  return screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props;
}

async function loadThreePages() {
  const rendered = renderList();
  await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
  await reachEnd();
  await screen.findByTestId(meetingRowTestId(aMeetingId('u4')));
  await reachEnd();
  await screen.findByTestId(meetingRowTestId(aMeetingId('u7')));
  expect(rendered.fakes.meetings.listCalls).toHaveLength(3);
  return rendered;
}

describe('a pull to refresh with several pages loaded', () => {
  it('starts again from the first page: one request, not one for each page loaded', async () => {
    const { fakes } = await loadThreePages();

    await act(async () => {
      refreshControl().onRefresh();
    });

    await waitFor(() => {
      expect(fakes.meetings.listCalls).toHaveLength(4);
    });
    expect(fakes.meetings.listCalls[3]?.request.cursor).toBeUndefined();
    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
  });

  it('shows what changed on the server in the first page, and can load the next ones again', async () => {
    const { fakes } = await loadThreePages();
    fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, UPCOMING.slice(1));

    await act(async () => {
      refreshControl().onRefresh();
    });
    await waitFor(() => {
      expect(shownIds()).toEqual(['u2', 'u3', 'u4']);
    });
    await reachEnd();

    await screen.findByTestId(meetingRowTestId(aMeetingId('u7')));
    expect(shownIds()).toEqual(['u2', 'u3', 'u4', 'u5', 'u6', 'u7']);
  });

  it('starts again from the first page when a failed refresh is tried again', async () => {
    const { fakes, t } = await loadThreePages();
    fakes.meetings.failure = unexpected();
    await act(async () => {
      refreshControl().onRefresh();
    });
    const error = await screen.findByTestId(TEST_IDS.refreshError);
    fakes.meetings.failure = undefined;
    const callsBefore = fakes.meetings.listCalls.length;

    fireEvent.press(screen.getByRole('button', { name: t('states.retry') }));

    await waitFor(() => {
      expect(screen.queryByTestId(TEST_IDS.refreshError)).toBeNull();
    });
    expect(error).toBeTruthy();
    expect(fakes.meetings.listCalls).toHaveLength(callsBefore + 1);
  });
});

describe('coming back to a period', () => {
  async function leaveAndComeBack(waitBeforeComingBack: number) {
    const rendered = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    fireEvent.press(screen.getByRole('tab', { name: rendered.t('meetings.period.past') }));
    await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));
    await act(async () => {
      jest.advanceTimersByTime(waitBeforeComingBack);
    });

    fireEvent.press(screen.getByRole('tab', { name: rendered.t('meetings.period.upcoming') }));
    return rendered;
  }

  it('shows it at once and asks nothing while what it holds is current', async () => {
    const { fakes } = await leaveAndComeBack(QUERY_STALE_TIME_MILLIS / 2);

    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    await act(async () => {
      await Promise.resolve();
    });
    expect(fakes.meetings.listCalls).toHaveLength(2);
  });

  it('shows it at once and checks with the server in the background once it is not current', async () => {
    const { fakes } = await leaveAndComeBack(QUERY_STALE_TIME_MILLIS * 2);

    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    await waitFor(() => {
      expect(fakes.meetings.listCalls).toHaveLength(3);
    });
    expect(fakes.meetings.listCalls[2]?.period).toBe(MEETING_PERIOD.Upcoming);
  });
});

describe('the refresh of one period', () => {
  it('does not show on the other period', async () => {
    const { fakes, t } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    const release = { run: noop };
    const gate = new Promise<void>((resolve) => {
      release.run = resolve;
    });
    fakes.meetings.onRequest = () => gate;

    await act(async () => {
      refreshControl().onRefresh();
    });
    expect(refreshControl().refreshing).toBe(true);

    fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));

    expect(refreshControl().refreshing).toBe(false);
    await act(async () => {
      release.run();
    });
    await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));
    expect(refreshControl().refreshing).toBe(false);
  });

  it('keeps one list for each period, so that the other starts from its own first rows', async () => {
    const { t } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    await reachEnd();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u4')));

    fireEvent.press(screen.getByRole('tab', { name: t('meetings.period.past') }));
    await screen.findByTestId(meetingRowTestId(aMeetingId('p1')));

    expect(shownIds()).toEqual(['p1', 'p2', 'p3']);
  });
});
