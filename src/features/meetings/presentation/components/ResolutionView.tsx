import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Instant } from '@core/domain/value-objects/Instant';
import type { MeetingId } from '@core/domain/value-objects/ids';
import { Badge } from '@core/presentation/components/Badge';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import {
  VOTING_DATE_KEYS,
  VOTING_STATE_KEYS,
  VOTE_CHOICE_KEYS,
} from '@core/presentation/i18n/translationKeys';
import { resolutionTestId } from '@core/presentation/testIds';
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
import { ResolutionVoting } from '@features/votes/presentation/components/ResolutionVoting';
import { VOTE_VIEW } from '@features/votes/presentation/hooks/resolutionVote';
import type { ResolutionVoteView } from '@features/votes/presentation/hooks/resolutionVote';

import { VOTING_STATE_TONES } from './badgeTones';

interface ResolutionViewProps {
  readonly resolution: Resolution;
  /**
   * The instant the data was produced at (`loadedAt` of the use case's answer). The state of the
   * vote is judged at that instant: this layer reads no clock. A screen that stays open past the
   * closing time shows the state as of the last load until it is refreshed.
   */
  readonly now: Instant;
  /**
   * The vote of the user, with the meeting it belongs to. Without it the resolution is display
   * only: it tells the vote the server recorded and offers nothing to do.
   */
  readonly voting?: {
    readonly meetingId: MeetingId;
    readonly view: ResolutionVoteView;
  };
}

/**
 * The resolution of an agenda item: its title and text, where voting stands (open, closed, or its
 * window over, told by the same rule as the eligibility to vote), the deadline or the date it
 * closed on, and the vote of the user: the one the server recorded, the one that waits to be sent,
 * or none. Given the state of their vote (`voting`), it also offers what the user can do about it
 * (see `ResolutionVoting`).
 */
export function ResolutionView({ resolution, now, voting }: ResolutionViewProps) {
  const { t } = useTranslation();
  const { dateTime } = useFormatters();
  const { recordedVote, closesAt } = resolution;
  const votingState = getVotingState(resolution, now);
  const view = voting?.view;
  // While the outbox is unknown the user may have a vote waiting that the line cannot tell yet:
  // saying "you have not voted" then would be a guess, so the line stays out.
  const voteUnknown = view?.kind === VOTE_VIEW.Loading || view?.kind === VOTE_VIEW.Unavailable;
  let voteLine: string | undefined;
  if (recordedVote !== undefined) {
    voteLine = t('meeting.resolutionYourVote', { choice: t(VOTE_CHOICE_KEYS[recordedVote]) });
  } else if (view?.kind === VOTE_VIEW.Queued) {
    voteLine = t('meeting.resolutionYourVoteQueued', { choice: t(VOTE_CHOICE_KEYS[view.choice]) });
  } else if (!voteUnknown) {
    voteLine = t('meeting.resolutionNoVote');
  }

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
      {voteLine === undefined ? null : <Text style={styles.detail}>{voteLine}</Text>}
      {voting === undefined ? null : (
        <ResolutionVoting meetingId={voting.meetingId} resolution={resolution} view={voting.view} />
      )}
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
