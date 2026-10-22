import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Meeting } from '@domain/entities/Meeting';
import { parseMeetingId } from '@domain/value-objects/ids';
import type { DocumentId, MeetingId } from '@domain/value-objects/ids';
import type { Instant } from '@domain/value-objects/Instant';
import { REPOSITORY_ERROR_CODE } from '@domain/errors/RepositoryError';
import { FRESHNESS } from '@application/shared/Loaded';
import { isRetryableCode } from '@application/shared/retryableCodes';

import { AgendaItemView } from '../components/AgendaItemView';
import { DocumentRow } from '../components/DocumentRow';
import { ErrorState } from '../components/ErrorState';
import { InlineError } from '../components/InlineError';
import { LoadingState } from '../components/LoadingState';
import { Message } from '../components/Message';
import { ParticipantRow } from '../components/ParticipantRow';
import { Section } from '../components/Section';
import { StatusBanner } from '../components/StatusBanner';
import { DemoOfflineSwitch } from '../components/DemoControls';
import { useAnnounce } from '../accessibility/useAnnounce';
import { useFormatters } from '../format/FormattersProvider';
import { useMeeting } from '../hooks/useMeeting';
import { VOTES_STATUS, useResolutionVotes } from '../hooks/useResolutionVotes';
import type { MeetingsErrorCode } from '../i18n/translationKeys';
import { errorCodeOf } from '../query/errorCode';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

interface MeetingDetailScreenProps {
  /** The `meetingId` segment of the route, as the router gives it. */
  readonly meetingId: string | undefined;
  /** Opens a document of the meeting in the viewer: the route file wires it to the navigation. */
  readonly onOpenDocument: (id: DocumentId) => void;
}

/**
 * The detail of a meeting. The route parameter is a string from outside, so it is parsed first:
 * one that is no meeting id cannot be a meeting that exists, and is shown as not found.
 */
export function MeetingDetailScreen({ meetingId, onOpenDocument }: MeetingDetailScreenProps) {
  const parsed = meetingId === undefined ? undefined : parseMeetingId(meetingId);

  if (parsed === undefined || !parsed.ok) return <NotFound />;
  return <MeetingDetail id={parsed.value} onOpenDocument={onOpenDocument} />;
}

function NotFound() {
  const { t } = useTranslation();

  return (
    <View style={styles.screen}>
      <Message centered message={t('errors.notFound')} testID={TEST_IDS.meetingNotFound} />
    </View>
  );
}

function MeetingDetail({
  id,
  onOpenDocument,
}: {
  readonly id: MeetingId;
  readonly onOpenDocument: (id: DocumentId) => void;
}) {
  const { t } = useTranslation();
  const { data, error, isPending, isError, isRefetchError, refetch } = useMeeting(id);
  const errorCode = isError ? errorCodeOf(error) : undefined;
  const [refreshing, setRefreshing] = useState(false);
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
        <LoadingState accessibilityLabel={t('meeting.loading')} testID={TEST_IDS.meetingLoading} />
      </View>
    );
  }
  if (errorCode !== undefined && (data === undefined || !isRetryableCode(errorCode))) {
    // A failure that asking again cannot fix is final, and replaces the meeting whatever was
    // loaded before. A meeting that does not exist is told as such.
    return errorCode === REPOSITORY_ERROR_CODE.NotFound ? (
      <NotFound />
    ) : (
      <View style={styles.screen}>
        <ErrorState code={errorCode} onRetry={retry} testID={TEST_IDS.meetingError} />
      </View>
    );
  }
  if (data === undefined) return null;

  return (
    <MeetingContent
      meeting={data.data}
      loadedAt={data.loadedAt}
      staleSince={data.source.freshness === FRESHNESS.Stale ? data.source.cachedAt : undefined}
      refreshError={isRefetchError ? errorCode : undefined}
      refreshing={refreshing}
      onRefresh={refresh}
      onRetry={retry}
      onOpenDocument={onOpenDocument}
    />
  );
}

interface MeetingContentProps {
  readonly meeting: Meeting;
  /** The instant the data was produced at, for the state of the votes. */
  readonly loadedAt: Instant;
  /** When the saved copy on the screen was cached, or `undefined` when it is fresh. */
  readonly staleSince: Instant | undefined;
  /** Why the last refresh failed, while the content of the last success stays on the screen. */
  readonly refreshError: MeetingsErrorCode | undefined;
  /** Whether the user's pull to refresh is under way. */
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onOpenDocument: (id: DocumentId) => void;
}

function MeetingContent({
  meeting,
  loadedAt,
  staleSince,
  refreshError,
  refreshing,
  onRefresh,
  onRetry,
  onOpenDocument,
}: MeetingContentProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { fullDateTime } = useFormatters();
  const votes = useResolutionVotes(meeting, loadedAt);
  useAnnounce(refreshing ? t('states.refreshing') : undefined);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      testID={TEST_IDS.meetingDetail}
    >
      <StatusBanner {...(staleSince === undefined ? {} : { staleSince })} />
      <DemoOfflineSwitch />
      {refreshError === undefined ? null : (
        <InlineError code={refreshError} onRetry={onRetry} testID={TEST_IDS.refreshError} />
      )}
      {votes.status === VOTES_STATUS.Unavailable ? (
        <InlineError code={votes.error} onRetry={votes.retry} testID={TEST_IDS.votingError} />
      ) : null}

      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title} testID={TEST_IDS.meetingTitle}>
          {meeting.title}
        </Text>
        <Text style={styles.detail}>{fullDateTime(meeting.scheduledAt)}</Text>
        <Text style={styles.detail}>{meeting.location}</Text>
      </View>

      <Section title={t('meeting.agenda')} testID={TEST_IDS.agendaSection}>
        {meeting.agenda.length === 0 ? (
          <Text style={styles.empty}>{t('meeting.agendaEmpty')}</Text>
        ) : (
          meeting.agenda.map((item) => (
            <AgendaItemView
              key={item.id}
              item={item}
              now={loadedAt}
              votes={{ meetingId: meeting.id, state: votes }}
            />
          ))
        )}
      </Section>

      <Section title={t('meeting.documents')} testID={TEST_IDS.documentsSection}>
        {meeting.documents.length === 0 ? (
          <Text style={styles.empty}>{t('meeting.documentsEmpty')}</Text>
        ) : (
          meeting.documents.map((document) => (
            <DocumentRow key={document.id} document={document} onOpen={onOpenDocument} />
          ))
        )}
      </Section>

      <Section title={t('meeting.participants')} testID={TEST_IDS.participantsSection}>
        {meeting.participants.length === 0 ? (
          <Text style={styles.empty}>{t('meeting.participantsEmpty')}</Text>
        ) : (
          meeting.participants.map((participant) => (
            <ParticipantRow key={participant.userId} participant={participant} />
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  empty: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
