import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Resolution } from '@domain/entities/Resolution';
import { RESOLUTION_STATUS } from '@domain/entities/Resolution';

import { useDateTimeFormatter } from '../format/useDateTimeFormatter';
import { RESOLUTION_STATUS_KEYS, VOTE_CHOICE_KEYS } from '../i18n/translationKeys';
import { resolutionTestId } from '../testIds';
import { borderWidths, colors, fontSizes, fontWeights, radii, spacing } from '../theme/tokens';

import { Badge } from './Badge';

interface ResolutionViewProps {
  readonly resolution: Resolution;
}

/**
 * The resolution of an agenda item: its title and text, whether it is open, when voting closes,
 * and the vote of the user if they cast one.
 *
 * Display only. Voting arrives with step 4: the vote buttons will be added under the line that
 * shows the recorded vote, through `CastVote`, and until then this component takes no callback,
 * so there is nothing to tap and nothing to disable.
 */
export function ResolutionView({ resolution }: ResolutionViewProps) {
  const { t } = useTranslation();
  const { dateTime } = useDateTimeFormatter();
  const { recordedVote, closesAt } = resolution;

  return (
    <View style={styles.resolution} testID={resolutionTestId(resolution.id)}>
      <Text style={styles.title}>{resolution.title}</Text>
      <Text style={styles.description}>{resolution.description}</Text>
      <Badge
        label={t(RESOLUTION_STATUS_KEYS[resolution.status])}
        tone={resolution.status === RESOLUTION_STATUS.Open ? 'positive' : 'neutral'}
      />
      {closesAt === undefined ? null : (
        <Text style={styles.detail}>
          {t('meeting.resolutionClosesAt', { date: dateTime(closesAt) })}
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
