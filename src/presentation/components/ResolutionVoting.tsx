import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { Resolution } from '@domain/entities/Resolution';
import { VOTING_ERROR_CODE } from '@domain/errors/VotingError';
import type { MeetingId } from '@domain/value-objects/ids';
import { VOTE_CHOICE } from '@domain/value-objects/VoteChoice';
import type { VoteChoice } from '@domain/value-objects/VoteChoice';
import type { CastVoteStatus } from '@application/use-cases/votes/CastVote';
import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';

import { useFormatters } from '../format/FormattersProvider';
import { VOTE_VIEW } from '../hooks/resolutionVote';
import type { ResolutionVoteView } from '../hooks/resolutionVote';
import { useCastVote } from '../hooks/useCastVote';
import {
  CAST_OUTCOME_KEYS,
  PARTICIPANT_ROLE_KEYS,
  VOTE_CHOICE_KEYS,
} from '../i18n/translationKeys';
import { rejectionReasonText, votingReasonText } from '../i18n/voteMessages';
import { useUiStore } from '../state/uiStore';
import {
  TEST_IDS,
  voteChoiceTestId,
  voteChoicesTestId,
  voteNoticeTestId,
  voteOutcomeTestId,
} from '../testIds';
import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

import { AcknowledgeButton } from './AcknowledgeButton';
import { Button } from './Button';
import { LiveText } from './LiveText';
import { VoteDialog } from './VoteDialog';

/** The choices, in the order they are offered. */
const CHOICES: readonly VoteChoice[] = [VOTE_CHOICE.For, VOTE_CHOICE.Against, VOTE_CHOICE.Abstain];

interface ResolutionVotingProps {
  readonly meetingId: MeetingId;
  readonly resolution: Resolution;
  readonly view: ResolutionVoteView;
}

/**
 * What the user can do about the vote on a resolution, and why they cannot when they cannot:
 *
 * - eligible: the three choices. Touching one opens the confirmation step (`VoteDialog`), which is
 *   where a vote is cast;
 * - a vote waiting to be sent: said by the line of the resolution, with the choice, and by the
 *   message that it is saved on this device, for as long as it waits: when it is sent or refused
 *   the view changes and the message goes with it;
 * - a vote that was rejected: why, and the button that acknowledges it;
 * - ineligible: the reason the rule gives (a role without a vote, a closed vote, a vote already
 *   cast), as text, with no control that would do nothing.
 *
 * The state of the cast lives here and not in the part that shows the choices, because casting a
 * vote changes what is shown: once the vote is recorded or queued the choices are gone, and the
 * confirmation must still be there to close itself when the screen shows the new state, and the
 * message that says a vote was recorded must outlive the choices.
 */
export function ResolutionVoting({ meetingId, resolution, view }: ResolutionVotingProps) {
  const { t } = useTranslation();
  const offline = useUiStore((state) => state.connectivity === CONNECTIVITY_STATUS.Offline);
  const [choice, setChoice] = useState<VoteChoice>();
  const [outcome, setOutcome] = useState<CastVoteStatus>();
  const cast = useCastVote((result) => {
    setOutcome(result.status);
    setChoice(undefined);
  });
  const { reset } = cast;
  const outcomeKey = outcome === undefined ? undefined : CAST_OUTCOME_KEYS[outcome];

  const choose = (selected: VoteChoice) => {
    reset();
    setOutcome(undefined);
    setChoice(selected);
  };
  const dismiss = () => {
    reset();
    setChoice(undefined);
  };

  return (
    <View style={styles.block}>
      {outcomeKey === undefined ? null : (
        <LiveText
          message={t(outcomeKey)}
          style={styles.outcome}
          testID={voteOutcomeTestId(resolution.id)}
        />
      )}
      <VoteState view={view} meetingId={meetingId} resolution={resolution} onChoose={choose} />
      <VoteDialog
        choice={choice}
        resolutionTitle={resolution.title}
        offline={offline}
        pending={cast.isPending}
        failure={cast.failure}
        onConfirm={() => {
          if (choice !== undefined) {
            cast.run({ meetingId, resolutionId: resolution.id, choice });
          }
        }}
        onDismiss={dismiss}
      />
    </View>
  );
}

interface VoteStateProps {
  readonly view: ResolutionVoteView;
  readonly meetingId: MeetingId;
  readonly resolution: Resolution;
  readonly onChoose: (choice: VoteChoice) => void;
}

function VoteState({ view, resolution, onChoose }: VoteStateProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const ineligibleText =
    view.kind === VOTE_VIEW.Ineligible
      ? view.error.code === VOTING_ERROR_CODE.NoVotingRights && view.role !== undefined
        ? t('voting.noVotingRightsAs', { role: t(PARTICIPANT_ROLE_KEYS[view.role]) })
        : votingReasonText(t, view.error)
      : undefined;

  switch (view.kind) {
    case VOTE_VIEW.Loading:
      return (
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={t('voting.loading')}
          accessibilityState={{ busy: true }}
          testID={TEST_IDS.votingLoading}
        >
          <ActivityIndicator color={colors.primary} />
        </View>
      );
    case VOTE_VIEW.Unavailable:
      return null;
    case VOTE_VIEW.Queued:
      return (
        <LiveText
          message={t('voting.queued')}
          style={styles.outcome}
          testID={voteOutcomeTestId(resolution.id)}
        />
      );
    case VOTE_VIEW.Eligible:
      return (
        <View style={styles.choices}>
          <Text accessibilityRole="header" style={styles.heading}>
            {t('voting.choose')}
          </Text>
          <View style={styles.choiceList} testID={voteChoicesTestId(resolution.id)}>
            {CHOICES.map((value) => (
              <Button
                key={value}
                title={t(VOTE_CHOICE_KEYS[value])}
                variant="secondary"
                accessibilityHint={t('voting.choiceHint')}
                onPress={() => {
                  onChoose(value);
                }}
                testID={voteChoiceTestId(resolution.id, value)}
              />
            ))}
          </View>
        </View>
      );
    case VOTE_VIEW.Rejected:
      return (
        <View style={styles.choices}>
          <LiveText
            message={t('voting.rejected', { reason: rejectionReasonText(t, view.reason, number) })}
            style={styles.rejected}
            testID={voteNoticeTestId(resolution.id)}
          />
          <AcknowledgeButton resolutionId={resolution.id} />
        </View>
      );
    case VOTE_VIEW.Ineligible:
      return (
        <Text style={styles.reason} testID={voteNoticeTestId(resolution.id)}>
          {ineligibleText}
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  block: {
    gap: spacing.sm,
  },
  choices: {
    gap: spacing.sm,
  },
  heading: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  // One below the other, each as wide as the screen: side by side, a third of the width left too
  // little for "Abstention" (French, 16 points) on a 402-point phone, which broke the word in two,
  // and a larger text size would do the same in any language.
  choiceList: {
    gap: spacing.sm,
  },
  outcome: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.positiveBadgeText,
  },
  rejected: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
  reason: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
