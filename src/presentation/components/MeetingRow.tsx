import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text } from 'react-native';

import type { MeetingId } from '@domain/value-objects/ids';

import { meetingRowTestId } from '../testIds';
import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  pressedOpacity,
  spacing,
  touchTarget,
} from '../theme/tokens';

interface MeetingRowProps {
  readonly id: MeetingId;
  readonly title: string;
  /** The date and time, already formatted for the language of the user. */
  readonly when: string;
  readonly location: string;
  readonly onOpen: (id: MeetingId) => void;
}

/**
 * A meeting in the list: title, date and time, location. It takes strings and a stable callback,
 * not objects, so that `memo` can skip the rows whose meeting has not changed when the list
 * re-renders.
 */
export const MeetingRow = memo(function MeetingRow({
  id,
  title,
  when,
  location,
  onOpen,
}: MeetingRowProps) {
  const { t } = useTranslation();
  const open = useCallback(() => {
    onOpen(id);
  }, [onOpen, id]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityHint={t('meetings.openHint')}
      onPress={open}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={meetingRowTestId(id)}
    >
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{when}</Text>
      <Text style={styles.detail}>{location}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: borderWidths.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
