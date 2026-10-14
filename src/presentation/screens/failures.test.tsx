import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { View } from 'react-native';

import { unauthorized, unexpected } from '@domain/errors/RepositoryError';
import {
  MILLIS_PER_HOUR,
  aMeeting,
  aMeetingId,
  aSession,
  aUser,
  aUserId,
} from '@domain/testing/builders';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';

import { discardSessionData } from '../query/createQueryClient';
import type { QueryClient } from '@tanstack/react-query';
import { ACCESS } from '../state/uiStore';
import { TEST_IDS, meetingRowTestId } from '../testIds';
import {
  MEETING_ROW_TEST_ID_PATTERN,
  meetingIdOfRowTestId,
  meetingsOf,
} from '../testing/meetingFixtures';
import { renderScreen } from '../testing/renderScreen';
import type { TestFakes } from '../testing/renderScreen';

import { MeetingDetailScreen } from './MeetingDetailScreen';
import { MeetingsListScreen } from './MeetingsListScreen';

// What the screens do when something that was loaded cannot be loaded again. A failure that asking
// again cannot fix is final for the screen: it shows the error and never the data it had before.
// One that ends the session also empties the whole cache and tells the interface store where the
// user goes (the sign-in or the lock screen); the screens are removed by the navigator, which is
// tested with the real one in `sessionEnd.test.tsx`. One that can pass leaves the data and offers
// the retry.

const noop = (): void => undefined;

const UPCOMING = meetingsOf('u', 7, MEETING_PERIOD.Upcoming);
const MEETING = aMeeting();

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

function renderList() {
  const rendered = renderScreen(<MeetingsListScreen onOpenMeeting={noop} />);
  rendered.fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, UPCOMING);
  return rendered;
}

function renderDetail() {
  const rendered = renderScreen(<MeetingDetailScreen meetingId={MEETING.id} />);
  rendered.fakes.meetings.addMeeting(MEETING);
  return rendered;
}

function shownIds(): string[] {
  return screen
    .queryAllByTestId(MEETING_ROW_TEST_ID_PATTERN)
    .map((row) => meetingIdOfRowTestId(String(row.props.testID)));
}

async function pullToRefresh(): Promise<void> {
  await act(async () => {
    screen.getByTestId(TEST_IDS.meetingsList).props.refreshControl.props.onRefresh();
  });
}

/** The ways the session can end under a screen that is showing data, and the text for each. */
const SESSION_ENDINGS: readonly [string, string, (fakes: TestFakes) => void][] = [
  [
    'unauthorized',
    'errors.unauthorized',
    (fakes) => {
      fakes.meetings.failure = unauthorized();
    },
  ],
  [
    'appLocked',
    'errors.appLocked',
    (fakes) => {
      fakes.appLock.lock();
    },
  ],
  [
    'notAuthenticated',
    'errors.notAuthenticated',
    (fakes) => {
      fakes.auth.session = undefined;
    },
  ],
  [
    'sessionExpired',
    'errors.sessionExpired',
    (fakes) => {
      fakes.clock.advance(2 * MILLIS_PER_HOUR);
    },
  ],
  [
    'sessionChanged',
    'errors.sessionChanged',
    (fakes) => {
      fakes.meetings.onRequest = () => {
        fakes.auth.session = aSession({ user: aUser({ id: aUserId('user-9') }) });
      };
    },
  ],
];

/**
 * The data the cache holds. A screen that is still mounted when the session ends (the navigator
 * removes it, but these tests have none) may build its query again, and the empty query it leaves
 * holds nothing of the user: it is data that must not be left.
 */
function cachedData(client: QueryClient): unknown[] {
  return client
    .getQueryCache()
    .getAll()
    .map((query) => query.state.data)
    .filter((data) => data !== undefined);
}

/** Where the user goes when the session ends, for each way it ends. */
function accessAfter(code: string) {
  return code === 'appLocked' ? ACCESS.Locked : ACCESS.SignedOut;
}

describe('when the session ends while a list is on the screen', () => {
  it.each(SESSION_ENDINGS)(
    'sends the user to the screen that fits and empties the cache: %s',
    async (code, _key, end) => {
      const { fakes, queryClient, uiStore } = renderList();
      await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
      expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);
      expect(uiStore.getState().access).toBe(ACCESS.Unlocked);

      end(fakes);
      await pullToRefresh();

      await waitFor(() => {
        expect(uiStore.getState().access).toBe(accessAfter(code));
      });
      expect(uiStore.getState().sessionEndedBy).toBe(code);
      expect(cachedData(queryClient)).toEqual([]);
    },
  );

  it('does not ask again once the session has ended', async () => {
    const { fakes, uiStore } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    fakes.meetings.failure = unauthorized();

    await pullToRefresh();
    await waitFor(() => {
      expect(uiStore.getState().access).toBe(ACCESS.SignedOut);
    });
    const calls = fakes.meetings.listCalls.length;
    await act(async () => {
      jest.advanceTimersByTime(10 * MILLIS_PER_HOUR);
    });

    expect(fakes.meetings.listCalls).toHaveLength(calls);
  });

  it('does the same when the next page is the one that is refused', async () => {
    const { fakes, queryClient, uiStore } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    fakes.meetings.failure = unauthorized();

    await act(async () => {
      fireEvent(screen.getByTestId(TEST_IDS.meetingsList), 'endReached');
    });

    await waitFor(() => {
      expect(uiStore.getState().sessionEndedBy).toBe('unauthorized');
    });
    expect(cachedData(queryClient)).toEqual([]);
  });
});

describe('when the session ends while a meeting is on the screen', () => {
  it.each(SESSION_ENDINGS)(
    'sends the user to the screen that fits and empties the cache: %s',
    async (code, _key, end) => {
      const { fakes, queryClient, uiStore } = renderDetail();
      await screen.findByRole('header', { name: MEETING.title });

      end(fakes);
      act(() => {
        void queryClient.refetchQueries();
      });

      await waitFor(() => {
        expect(uiStore.getState().access).toBe(accessAfter(code));
      });
      expect(uiStore.getState().sessionEndedBy).toBe(code);
      expect(cachedData(queryClient)).toEqual([]);
    },
  );
});

describe('when a meeting that was on the screen is refused or gone', () => {
  it('shows the refusal in place of the meeting, with no retry', async () => {
    const { fakes, queryClient, t } = renderDetail();
    await screen.findByRole('header', { name: MEETING.title });
    fakes.meetings.forbid(MEETING.id);

    act(() => {
      void queryClient.refetchQueries();
    });

    const error = await screen.findByTestId(TEST_IDS.meetingError);
    expect(within(error).getByText(t('errors.forbidden'))).toBeTruthy();
    expect(within(error).queryByRole('button')).toBeNull();
    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
  });

  it('shows that it does not exist in place of the meeting', async () => {
    const { fakes, queryClient, t } = renderDetail();
    await screen.findByRole('header', { name: MEETING.title });
    fakes.meetings.removeMeeting(MEETING.id);

    act(() => {
      void queryClient.refetchQueries();
    });

    const missing = await screen.findByTestId(TEST_IDS.meetingNotFound);
    expect(within(missing).getByText(t('errors.notFound'))).toBeTruthy();
    expect(screen.queryByText(MEETING.title)).toBeNull();
    expect(screen.queryByTestId(TEST_IDS.meetingDetail)).toBeNull();
  });

  it('keeps the meeting, and offers the retry, for a failure that can pass', async () => {
    const { fakes, queryClient, t } = renderDetail();
    await screen.findByRole('header', { name: MEETING.title });
    fakes.meetings.failure = unexpected();

    act(() => {
      void queryClient.refetchQueries();
    });

    const error = await screen.findByTestId(TEST_IDS.refreshError);
    expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
    expect(within(error).getByRole('button', { name: t('states.retry') })).toBeTruthy();
    expect(screen.getByTestId(TEST_IDS.meetingDetail)).toBeTruthy();
  });
});

describe('the error of a next page', () => {
  it.each([
    ['the server cannot be reached', 'errors.networkUnavailable'],
    ['the server fails', 'errors.unexpected'],
  ] as const)('says why, with its own text, when %s', async (_reason, key) => {
    const { fakes, t } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    if (key === 'errors.unexpected') fakes.meetings.failure = unexpected();
    else fakes.network.goOffline();

    await act(async () => {
      fireEvent(screen.getByTestId(TEST_IDS.meetingsList), 'endReached');
    });

    const footer = await screen.findByTestId(TEST_IDS.meetingsLoadMoreError);
    expect(within(footer).getByText(t(key))).toBeTruthy();
    expect(within(footer).getByRole('button', { name: t('states.retry') })).toBeTruthy();
  });
});

describe('a rejection that is not the failure of a use case', () => {
  const boom = (): never => {
    throw new Error('boom');
  };

  it('shows the list as an unexpected error with a retry, instead of crashing', async () => {
    const { fakes, t } = renderList();
    fakes.meetings.onRequest = boom;

    const error = await screen.findByTestId(TEST_IDS.meetingsError);

    expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
    expect(within(error).getByRole('button', { name: t('states.retry') })).toBeTruthy();
  });

  it('shows the meeting as an unexpected error with a retry, instead of crashing', async () => {
    const { fakes, t } = renderDetail();
    fakes.meetings.onRequest = boom;

    const error = await screen.findByTestId(TEST_IDS.meetingError);

    expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
    expect(within(error).getByRole('button', { name: t('states.retry') })).toBeTruthy();
  });

  it('shows an error next to the rows when the refresh is the one that rejects', async () => {
    const { fakes, t } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));
    fakes.meetings.onRequest = boom;

    await pullToRefresh();

    const error = await screen.findByTestId(TEST_IDS.refreshError);
    expect(within(error).getByText(t('errors.unexpected'))).toBeTruthy();
    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
  });
});

describe('a second user on the same device', () => {
  const SECOND = aSession({ user: aUser({ id: aUserId('user-2') }) });
  const OTHER_MEETINGS = meetingsOf('b', 2, MEETING_PERIOD.Upcoming);

  /** Holds the answer of the server until the test lets it go. */
  function holdRequests(fakes: TestFakes): { release: () => void } {
    let release = noop;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fakes.meetings.onRequest = () => gate;
    return { release: () => release() };
  }

  it('never sees the rows of the first user, not even while their own request is in flight', async () => {
    const { fakes, queryClient, rerender } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

    // What a sign-out does (step 4): the screens are left, and the cache is emptied.
    rerender(<View />);
    discardSessionData(queryClient);
    fakes.auth.session = SECOND;
    fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, OTHER_MEETINGS);
    const held = holdRequests(fakes);
    rerender(<MeetingsListScreen onOpenMeeting={noop} />);

    expect(screen.getByTestId(TEST_IDS.meetingsLoading)).toBeTruthy();
    expect(shownIds()).toEqual([]);
    expect(queryClient.getQueryCache().getAll().length).toBe(1);

    await act(async () => {
      held.release();
    });
    await screen.findByTestId(meetingRowTestId(aMeetingId('b1')));
    expect(shownIds()).toEqual(['b1', 'b2']);
  });

  it('would see them, until their own answer comes, if the cache were not emptied: that is what the sign-out is for', async () => {
    const { fakes, queryClient, rerender } = renderList();
    await screen.findByTestId(meetingRowTestId(aMeetingId('u1')));

    rerender(<View />);
    fakes.auth.session = SECOND;
    fakes.meetings.setMeetings(MEETING_PERIOD.Upcoming, OTHER_MEETINGS);
    holdRequests(fakes);
    rerender(<MeetingsListScreen onOpenMeeting={noop} />);

    expect(shownIds()).toEqual(['u1', 'u2', 'u3']);
    expect(queryClient.getQueryCache().getAll().length).toBe(1);
  });

  it('is told, by the use case, when the user changed under a request that was in flight', async () => {
    const { fakes, uiStore } = renderList();
    fakes.meetings.onRequest = () => {
      fakes.auth.session = SECOND;
    };

    await waitFor(() => {
      expect(uiStore.getState().sessionEndedBy).toBe('sessionChanged');
    });
  });
});

it('does not end the session for a meeting that is refused: only that meeting is lost', async () => {
  const { fakes, queryClient, uiStore } = renderDetail();
  await screen.findByRole('header', { name: MEETING.title });
  fakes.meetings.forbid(MEETING.id);

  act(() => {
    void queryClient.refetchQueries();
  });

  await screen.findByTestId(TEST_IDS.meetingError);
  expect(uiStore.getState().access).toBe(ACCESS.Unlocked);
  expect(uiStore.getState().sessionEndedBy).toBeUndefined();
  // The meeting itself, and who the user is and what waits in their outbox, are still held.
  expect(cachedData(queryClient)).not.toEqual([]);
});
