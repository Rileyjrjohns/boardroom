import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUiStore } from '@composition/shell/state/uiStore';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { useAnnounce } from '@core/presentation/accessibility/useAnnounce';
import { DemoOfflineSwitch } from '@core/presentation/components/DemoControls';
import { ErrorState } from '@core/presentation/components/ErrorState';
import { InlineError } from '@core/presentation/components/InlineError';
import { LoadingState } from '@core/presentation/components/LoadingState';
import { Message } from '@core/presentation/components/Message';
import { SegmentedControl } from '@core/presentation/components/SegmentedControl';
import type { SegmentedOption } from '@core/presentation/components/SegmentedControl';
import { StatusBanner } from '@core/presentation/components/StatusBanner';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { EMPTY_LIST_KEYS, MEETING_PERIOD_KEYS } from '@core/presentation/i18n/translationKeys';
import { errorCodeOf } from '@core/presentation/query/errorCode';
import { periodOptionTestId, TEST_IDS } from '@core/presentation/testIds';
import { colors, spacing } from '@core/presentation/theme/tokens';
import type { MeetingSummary } from '@features/meetings/domain/entities/MeetingSummary';
import { MEETING_PERIOD } from '@features/meetings/domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@features/meetings/domain/value-objects/MeetingPeriod';

import { MeetingRow } from '../components/MeetingRow';
import { useMeetingsList } from '../hooks/useMeetingsList';

/** How far from the end of the list, in lengths of the visible part, the next page is asked for. */
const END_REACHED_THRESHOLD = 0.5;

const PERIODS: readonly MeetingPeriod[] = [MEETING_PERIOD.Upcoming, MEETING_PERIOD.Past];

interface MeetingsListScreenProps {
  /** Opens a meeting. The route wires it to the navigation. */
  readonly onOpenMeeting: (id: MeetingId) => void;
}

const keyExtractor = (meeting: MeetingSummary): string => meeting.id;

/**
 * The meetings of the user, upcoming or past. The period is chosen with a segmented control and
 * kept in the interface store; each period has its own list (see `PeriodList`), so nothing of one
 * shows on the other.
 */
export function MeetingsListScreen({ onOpenMeeting }: MeetingsListScreenProps) {
  const { t } = useTranslation();
  const period = useUiStore((state) => state.meetingsPeriod);
  const selectPeriod = useUiStore((state) => state.selectMeetingsPeriod);

  const options = useMemo<readonly SegmentedOption<MeetingPeriod>[]>(
    () =>
      PERIODS.map((value) => ({
        value,
        label: t(MEETING_PERIOD_KEYS[value]),
        testID: periodOptionTestId(value),
      })),
    [t],
  );

  return (
    <View style={styles.screen}>
      <DemoOfflineSwitch />
      <SegmentedControl
        options={options}
        value={period}
        onChange={selectPeriod}
        accessibilityLabel={t('meetings.period.label')}
      />
      {/* Keyed by period: a period is a list of its own, with its own pull to refresh in progress
          and its own scroll position, not the same list given other data. */}
      <PeriodList key={period} period={period} onOpenMeeting={onOpenMeeting} />
    </View>
  );
}

interface PeriodListProps {
  readonly period: MeetingPeriod;
  readonly onOpenMeeting: (id: MeetingId) => void;
}

/**
 * The meetings of one period, a page at a time. The next page is loaded when the end of the list is
 * near, a pull starts again from the first page, and the states of a list are all handled: loading,
 * error with a way to retry, empty, and the end of the list. When the server cannot be reached and
 * a saved copy is shown, a banner says since when.
 *
 * Only an error that can pass is shown next to the list, with its retry. Every other error a list
 * can meet says the session is over (the server refused it, it expired, another user is signed in,
 * the app is locked), and ends the session for the whole app: the store moves the user to the
 * sign-in or the lock screen, with the reason, and the cache is emptied (`createAppState`), so no
 * row of the list outlives it.
 */
function PeriodList({ period, onOpenMeeting }: PeriodListProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { dateTime } = useFormatters();
  const [refreshing, setRefreshing] = useState(false);
  const {
    data,
    error,
    isPending,
    isError,
    isRefetchError,
    isFetchNextPageError,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    restart,
  } = useMeetingsList(period);
  useAnnounce(refreshing ? t('states.refreshing') : undefined);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<MeetingSummary>) => (
      <MeetingRow
        id={item.id}
        title={item.title}
        when={dateTime(item.scheduledAt)}
        location={item.location}
        onOpen={onOpenMeeting}
      />
    ),
    [dateTime, onOpenMeeting],
  );

  const loadMore = useCallback(() => {
    // After a failed page the user decides when to try again, with the button of the footer.
    // A second end-reached event before the first page arrives must not start another request.
    if (hasNextPage && !isFetchingNextPage && !isFetchNextPageError) {
      void fetchNextPage({ cancelRefetch: false });
    }
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  const retry = useCallback(() => {
    void restart();
  }, [restart]);

  const retryNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await restart();
    } finally {
      setRefreshing(false);
    }
  }, [restart]);

  const contentStyle = useMemo(
    () => [styles.content, { paddingBottom: insets.bottom + spacing.lg }],
    [insets.bottom],
  );

  const listState = useMemo(() => ({ busy: isPending || refreshing }), [isPending, refreshing]);

  const errorCode = isError ? errorCodeOf(error) : undefined;

  const meetings = data?.meetings ?? [];
  const refreshFailed = isRefetchError && !isFetchNextPageError && meetings.length > 0;

  let empty: ReactElement;
  if (isPending) {
    empty = (
      <LoadingState accessibilityLabel={t('meetings.loading')} testID={TEST_IDS.meetingsLoading} />
    );
  } else if (errorCode !== undefined) {
    empty = <ErrorState code={errorCode} onRetry={retry} testID={TEST_IDS.meetingsError} />;
  } else {
    empty = (
      <Message centered message={t(EMPTY_LIST_KEYS[period])} testID={TEST_IDS.meetingsEmpty} />
    );
  }

  let footer: ReactElement | null = null;
  if (isFetchingNextPage) {
    footer = (
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('meetings.loadingMore')}
        accessibilityState={{ busy: true }}
        style={styles.footer}
        testID={TEST_IDS.meetingsLoadingMore}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (isFetchNextPageError && errorCode !== undefined) {
    footer = (
      <InlineError
        code={errorCode}
        onRetry={retryNextPage}
        testID={TEST_IDS.meetingsLoadMoreError}
      />
    );
  } else if (meetings.length > 0 && !hasNextPage) {
    footer = <Message message={t('meetings.endOfList')} testID={TEST_IDS.meetingsEnd} />;
  }

  return (
    <>
      <StatusBanner {...(data?.staleSince === undefined ? {} : { staleSince: data.staleSince })} />
      {refreshFailed && errorCode !== undefined ? (
        <InlineError code={errorCode} onRetry={retry} testID={TEST_IDS.refreshError} />
      ) : null}
      <FlatList
        data={meetings}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={END_REACHED_THRESHOLD}
        refreshing={refreshing}
        onRefresh={refresh}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentContainerStyle={contentStyle}
        accessibilityState={listState}
        testID={TEST_IDS.meetingsList}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
  },
  footer: {
    padding: spacing.lg,
  },
});
