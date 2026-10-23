import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Instant } from '@core/domain/value-objects/Instant';
import { Badge } from '@core/presentation/components/Badge';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  radii,
  spacing,
} from '@core/presentation/theme/tokens';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import { getVotingState } from '@features/meetings/domain/policies/votingState';

import { VOTING_DATE_KEYS, VOTING_STATE_KEYS } from '../i18n/meetingMessageKeys';
import { resolutionTestId } from '../testIds';

import { VOTING_STATE_TONES } from './badgeTones';
import { ResolutionVoteLine } from './ResolutionVoteLine';

interface ResolutionViewProps {
  readonly resolution: Resolution;
  /**
   * The instant the data was produced at (`loadedAt` of the use case's answer). The state of the
   * vote is judged at that instant: this layer reads no clock. A screen that stays open past the
   * closing time shows the state as of the last load until it is refreshed.
   */
  readonly now: Instant;
  /**
   * What a feature adds under the resolution, from the line about the vote of the user down (see
   * `ResolutionActionsSlot`). Without it the resolution is display only: it tells the vote the
   * server recorded and offers nothing to do.
   */
  readonly actions?: ReactNode;
}

/**
 * The resolution of an agenda item: its title and text, where voting stands (open, closed, or its
 * window over, told by the same rule as the eligibility to vote), the deadline or the date it
 * closed on, and the vote of the user: the one the server recorded, the one that waits to be sent,
 * or none. When a feature plugs actions into the slot (`actions`), they come in the place of that
 * line, and offer what the user can do about the resolution.
 */
export function ResolutionView({ resolution, now, actions }: ResolutionViewProps) {
  const { t } = useTranslation();
  const { dateTime } = useFormatters();
  const { closesAt } = resolution;
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
      {actions === undefined ? <ResolutionVoteLine resolution={resolution} /> : actions}
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
