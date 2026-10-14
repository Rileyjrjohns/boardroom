import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { isRejected } from '@domain/entities/OutboxVote';
import type { OutboxVote } from '@domain/entities/OutboxVote';
import type { MeetingId } from '@domain/value-objects/ids';

import { useFormatters } from '../format/FormattersProvider';
import { VOTE_CHOICE_KEYS } from '../i18n/translationKeys';
import { rejectionReasonText } from '../i18n/voteMessages';
import { openVoteMeetingTestId, pendingVoteTestId, rejectedVoteTestId } from '../testIds';
import { borderWidths, colors, fontSizes, fontWeights, radii, spacing } from '../theme/tokens';

import { AcknowledgeButton } from './AcknowledgeButton';
import { Button } from './Button';
import { LiveText } from './LiveText';

interface OutboxVoteRowProps {
  readonly entry: OutboxVote;
  /** Opens the meeting the vote is about: the resolution it was cast on is there. */
  readonly onOpenMeeting: (id: MeetingId) => void;
}

/**
 * A vote of the outbox: the choice and when it was cast, and what became of it. A vote that waits
 * says so by being in the first list of its screen; a vote that was rejected tells why and can be
 * acknowledged. The outbox holds the ids of the meeting and the resolution and not their titles,
 * so the row leads to the meeting, where the resolution is.
 */
export function OutboxVoteRow({ entry, onOpenMeeting }: OutboxVoteRowProps) {
  const { t } = useTranslation();
  const { dateTime, number } = useFormatters();
  const { vote } = entry;
  const rejected = isRejected(entry);

  return (
    <View
      style={styles.row}
      testID={
        rejected ? rejectedVoteTestId(vote.resolutionId) : pendingVoteTestId(vote.resolutionId)
      }
    >
      <Text style={styles.choice}>
        {t('meeting.resolutionYourVote', { choice: t(VOTE_CHOICE_KEYS[vote.choice]) })}
      </Text>
      <Text style={styles.detail}>{t('pendingVotes.castAt', { date: dateTime(vote.castAt) })}</Text>
      {rejected ? (
        <>
          <LiveText message={rejectionReasonText(t, entry.reason, number)} style={styles.reason} />
          <Text style={styles.detail}>
            {t('pendingVotes.rejectedAt', { date: dateTime(entry.rejectedAt) })}
          </Text>
          <AcknowledgeButton resolutionId={vote.resolutionId} />
        </>
      ) : null}
      <Button
        title={t('pendingVotes.openMeeting')}
        variant="secondary"
        onPress={() => {
          onOpenMeeting(vote.meetingId);
        }}
        testID={openVoteMeetingTestId(vote.resolutionId)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  choice: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
  reason: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
