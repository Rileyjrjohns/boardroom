import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { borderWidths, colors, fontSizes, spacing } from '@core/presentation/theme/tokens';
import type { Participant } from '@features/meetings/domain/entities/Participant';
import { PARTICIPANT_ROLE_KEYS } from '../i18n/meetingMessageKeys';
import { participantTestId } from '../testIds';

interface ParticipantRowProps {
  readonly participant: Participant;
}

/** A person invited to the meeting, with their role. */
export function ParticipantRow({ participant }: ParticipantRowProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.row} testID={participantTestId(participant.userId)}>
      <Text style={styles.name}>{participant.fullName}</Text>
      <Text style={styles.role}>{t(PARTICIPANT_ROLE_KEYS[participant.role])}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    justifyContent: 'space-between',
    gap: spacing.md,
    borderBottomWidth: borderWidths.hairline,
    borderBottomColor: colors.border,
  },
  name: {
    flexShrink: 1,
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  role: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
