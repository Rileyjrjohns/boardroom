import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { colors, fontSizes } from '@core/presentation/theme/tokens';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';
import type { VoteChoice } from '@features/meetings/domain/value-objects/VoteChoice';

import { VOTE_CHOICE_KEYS } from '../i18n/meetingMessageKeys';

interface ResolutionVoteLineProps {
  readonly resolution: Resolution;
  /**
   * The choice of a vote of the user that waits to be sent, when whoever knows the outbox says so
   * (the votes, through the slot of the resolution actions). The meetings know only the vote the
   * server recorded.
   */
  readonly queuedChoice?: VoteChoice;
  /**
   * Whether the vote of the user is not known yet: while the outbox is unknown the user may have a
   * vote waiting that the line cannot tell, so saying "you have not voted" would be a guess and the
   * line stays out.
   */
  readonly unknown?: boolean;
}

/**
 * The line that tells the vote of the user on a resolution: the one the server recorded, the one
 * that waits to be sent, or none.
 */
export function ResolutionVoteLine({ resolution, queuedChoice, unknown }: ResolutionVoteLineProps) {
  const { t } = useTranslation();
  const { recordedVote } = resolution;
  let voteLine: string | undefined;
  if (recordedVote !== undefined) {
    voteLine = t('meeting.resolutionYourVote', { choice: t(VOTE_CHOICE_KEYS[recordedVote]) });
  } else if (queuedChoice !== undefined) {
    voteLine = t('meeting.resolutionYourVoteQueued', { choice: t(VOTE_CHOICE_KEYS[queuedChoice]) });
  } else if (unknown !== true) {
    voteLine = t('meeting.resolutionNoVote');
  }

  return voteLine === undefined ? null : <Text style={styles.detail}>{voteLine}</Text>;
}

const styles = StyleSheet.create({
  detail: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
