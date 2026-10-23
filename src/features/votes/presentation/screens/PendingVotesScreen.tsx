import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isRetryableCode } from '@core/application/retryableCodes';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { useAnnounce } from '@core/presentation/accessibility/useAnnounce';
import { DemoOfflineSwitch } from '@core/presentation/components/DemoControls';
import { ErrorState } from '@core/presentation/components/ErrorState';
import { InlineError } from '@core/presentation/components/InlineError';
import { LoadingState } from '@core/presentation/components/LoadingState';
import { Message } from '@core/presentation/components/Message';
import { Section } from '@core/presentation/components/Section';
import { StatusBanner } from '@core/presentation/components/StatusBanner';
import { errorCodeOf } from '@core/presentation/query/errorCode';
import { TEST_IDS } from '@core/presentation/testIds';
import { colors, fontSizes, spacing } from '@core/presentation/theme/tokens';

import { OutboxVoteRow } from '../components/OutboxVoteRow';
import { UnreadableVotesNotice } from '../components/UnreadableVotesNotice';
import { usePendingVotes } from '../hooks/usePendingVotes';

interface PendingVotesScreenProps {
  /** Opens a meeting. The route wires it to the navigation. */
  readonly onOpenMeeting: (id: MeetingId) => void;
}

/**
 * The votes of the user that are not settled: the ones waiting to be sent (cast without a
 * connection, or when the server failed) and the ones that were rejected, with their reason, until
 * the user acknowledges them. They come from the outbox through `ListPendingVotes`. The votes are
 * sent by the synchronisation, never from here: the screen shows what is waiting and what became
 * of it, and a pull asks the outbox again.
 */
export function PendingVotesScreen({ onOpenMeeting }: PendingVotesScreenProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { data, error, isPending, isError, isRefetchError, refetch } = usePendingVotes();
  const [refreshing, setRefreshing] = useState(false);
  useAnnounce(refreshing ? t('states.refreshing') : undefined);
  const errorCode = isError ? errorCodeOf(error) : undefined;

  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

  if (isPending) {
    return (
      <View style={styles.screen}>
        <LoadingState
          accessibilityLabel={t('pendingVotes.loading')}
          testID={TEST_IDS.pendingVotesLoading}
        />
      </View>
    );
  }
  // An error that asking again cannot fix is final for the screen, and replaces what was loaded.
  if (errorCode !== undefined && (data === undefined || !isRetryableCode(errorCode))) {
    return (
      <View style={styles.screen}>
        <ErrorState code={errorCode} onRetry={retry} testID={TEST_IDS.pendingVotesError} />
      </View>
    );
  }
  if (data === undefined) return null;

  const { pending, rejected, unreadable } = data;
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      testID={TEST_IDS.pendingVotesScreen}
    >
      <StatusBanner />
      <DemoOfflineSwitch />
      {isRefetchError && errorCode !== undefined ? (
        <InlineError code={errorCode} onRetry={retry} testID={TEST_IDS.refreshError} />
      ) : null}
      <Text style={styles.explanation}>{t('pendingVotes.explanation')}</Text>
      {unreadable === 0 ? null : <UnreadableVotesNotice count={unreadable} />}
      {pending.length === 0 && rejected.length === 0 ? (
        <Message centered message={t('pendingVotes.empty')} testID={TEST_IDS.pendingVotesEmpty} />
      ) : null}
      {pending.length === 0 ? null : (
        <Section title={t('pendingVotes.waiting')} testID={TEST_IDS.pendingVotesWaiting}>
          {pending.map((entry) => (
            <OutboxVoteRow
              key={entry.vote.idempotencyKey}
              entry={entry}
              onOpenMeeting={onOpenMeeting}
            />
          ))}
        </Section>
      )}
      {rejected.length === 0 ? null : (
        <Section title={t('pendingVotes.rejected')} testID={TEST_IDS.pendingVotesRejected}>
          {rejected.map((entry) => (
            <OutboxVoteRow
              key={entry.vote.idempotencyKey}
              entry={entry}
              onOpenMeeting={onOpenMeeting}
            />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  explanation: {
    padding: spacing.lg,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
