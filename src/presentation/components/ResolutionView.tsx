import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Resolution } from '@domain/entities/Resolution';
import { getVotingState } from '@domain/policies/votingState';
import type { Instant } from '@domain/value-objects/Instant';

import { useFormatters } from '../format/FormattersProvider';
import { VOTING_DATE_KEYS, VOTING_STATE_KEYS, VOTE_CHOICE_KEYS } from '../i18n/translationKeys';
import { resolutionTestId } from '../testIds';
import { borderWidths, colors, fontSizes, fontWeights, radii, spacing } from '../theme/tokens';

import { Badge } from './Badge';
import { VOTING_STATE_TONES } from './badgeTones';

interface ResolutionViewProps {
  readonly resolution: Resolution;
  /**
   * The instant the data was produced at (`loadedAt` of the use case's answer). The state of the
   * vote is judged at that instant: this layer reads no clock. A screen that stays open past the
   * closing time shows the state as of the last load until it is refreshed.
   */
  readonly now: Instant;
}

/**
 * The resolution of an agenda item: its title and text, where voting stands (open, closed, or its
 * window over, told by the same rule as the eligibility to vote), the deadline or the date it
 * closed on, and the vote of the user if they cast one.
 *
 * Display only. Voting arrives with step 4: the vote buttons will be added under the line that
 * shows the recorded vote, through `CastVote`, and until then this component takes no callback,
 * so there is nothing to tap and nothing to disable.
 */
export function ResolutionView({ resolution, now }: ResolutionViewProps) {
  const { t } = useTranslation();
  const { dateTime } = useFormatters();
  const { recordedVote, closesAt } = resolution;
  const votingState = getVotingState(resolution, now);

  return (
    <View style={styles.resolution} testID={resolutionTestId(resolution.id)}>
      <Text style={styles.title}>{resolution.title}</Text>
      <Text style={styles.description}>{resolution.description}</Text>
      <Badge label={t(VOTING_STATE_KEYS[votingState])} tone={VOTING_STATE_TONES[votingState]} />
      {closesAt === undefined ? null : (
        <Text style={styles.detail}>
          {t(VOTING_DATE_KEYS[votingState], { date: dateTime(closesAt) })}
        </Text>
      )}
      <Text style={styles.detail}>
        {recordedVote === undefined
          ? t('meeting.resolutionNoVote')
          : t('meeting.resolutionYourVote', { choice: t(VOTE_CHOICE_KEYS[recordedVote]) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resolution: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  description: {
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
