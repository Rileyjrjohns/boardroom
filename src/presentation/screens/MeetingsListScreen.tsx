import { useCallback, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import type { ListRenderItemInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MeetingSummary } from '@domain/entities/MeetingSummary';
import type { MeetingId } from '@domain/value-objects/ids';
import { MEETING_PERIOD } from '@domain/value-objects/MeetingPeriod';
import type { MeetingPeriod } from '@domain/value-objects/MeetingPeriod';

import { ErrorState } from '../components/ErrorState';
import { InlineError } from '../components/InlineError';
import { LoadingState } from '../components/LoadingState';
import { MeetingRow } from '../components/MeetingRow';
import { Message } from '../components/Message';
import { SegmentedControl } from '../components/SegmentedControl';
import type { SegmentedOption } from '../components/SegmentedControl';
import { StaleBanner } from '../components/StaleBanner';
import { useDateTimeFormatter } from '../format/useDateTimeFormatter';
import { useMeetingsList } from '../hooks/useMeetingsList';
import { EMPTY_LIST_KEYS, MEETINGS_ERROR_KEYS, MEETING_PERIOD_KEYS } from '../i18n/translationKeys';
import { periodOptionTestId, TEST_IDS } from '../testIds';
import { colors, spacing } from '../theme/tokens';
import { useUiStore } from '../state/uiStore';

/** How far from the end of the list, in lengths of the visible part, the next page is asked for. */
const END_REACHED_THRESHOLD = 0.5;

const PERIODS: readonly MeetingPeriod[] = [MEETING_PERIOD.Upcoming, MEETING_PERIOD.Past];

interface MeetingsListScreenProps {
  /** Opens a meeting. The route wires it to the navigation. */
  readonly onOpenMeeting: (id: MeetingId) => void;
}

const keyExtractor = (meeting: MeetingSummary): string => meeting.id;

/**
 * The meetings of the user, upcoming or past, a page at a time. The period is chosen with a
 * segmented control and kept in the interface store, so it survives opening a meeting and coming
 * back. The next page is loaded when the end of the list is near, a pull refreshes it, and the
 * four states of a list are all handled: loading, error with a way to retry, empty, and the end of
 * the list. When the server cannot be reached and a saved copy is shown, a banner says since when.
 */
export function MeetingsListScreen({ onOpenMeeting }: MeetingsListScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { dateTime } = useDateTimeFormatter();
  const period = useUiStore((state) => state.meetingsPeriod);
  const selectPeriod = useUiStore((state) => state.selectMeetingsPeriod);
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
    refetch,
  } = useMeetingsList(period);

  const options = useMemo<readonly SegmentedOption<MeetingPeriod>[]>(
    () =>
      PERIODS.map((value) => ({
        value,
        label: t(MEETING_PERIOD_KEYS[value]),
        testID: periodOptionTestId(value),
      })),
    [t],
  );

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
    void refetch();
  }, [refetch]);

  const retryNextPage = useCallback(() => {
    void fetchNextPage();
  }, [fetchNextPage]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  const meetings = data?.meetings ?? [];
  const refreshFailed = isRefetchError && !isFetchNextPageError && meetings.length > 0;
  const contentStyle = useMemo(
    () => [styles.content, { paddingBottom: insets.bottom + spacing.lg }],
    [insets.bottom],
  );

  let empty: ReactElement;
  if (isPending) {
    empty = (
      <LoadingState accessibilityLabel={t('meetings.loading')} testID={TEST_IDS.meetingsLoading} />
    );
  } else if (isError && error !== null) {
    empty = <ErrorState code={error.error.code} onRetry={retry} testID={TEST_IDS.meetingsError} />;
  } else {
    empty = (
      <Message centered message={t(EMPTY_LIST_KEYS[period])} testID={TEST_IDS.meetingsEmpty} />
    );
  }

  let footer: ReactElement | null = null;
  if (isFetchingNextPage) {
    footer = (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={t('meetings.loadingMore')}
        style={styles.footer}
        testID={TEST_IDS.meetingsLoadingMore}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  } else if (isFetchNextPageError) {
    footer = (
      <InlineError
        message={t('meetings.loadMoreFailed')}
        onRetry={retryNextPage}
        testID={TEST_IDS.meetingsLoadMoreError}
      />
    );
  } else if (meetings.length > 0 && !hasNextPage) {
    footer = <Message message={t('meetings.endOfList')} testID={TEST_IDS.meetingsEnd} />;
  }

  return (
    <View style={styles.screen}>
      <SegmentedControl
        options={options}
        value={period}
        onChange={selectPeriod}
        accessibilityLabel={t('meetings.period.label')}
      />
      {data?.staleSince === undefined ? null : <StaleBanner cachedAt={data.staleSince} />}
      {refreshFailed && error !== null ? (
        <InlineError
          message={t(MEETINGS_ERROR_KEYS[error.error.code])}
          onRetry={retry}
          testID={TEST_IDS.refreshError}
        />
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
        testID={TEST_IDS.meetingsList}
      />
    </View>
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
