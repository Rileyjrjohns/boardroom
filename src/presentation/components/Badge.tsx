import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, radii, spacing } from '../theme/tokens';

type BadgeTone = 'neutral' | 'positive' | 'confidential';

interface BadgeProps {
  /** The translated text. */
  readonly label: string;
  readonly tone?: BadgeTone;
}

/** A short label on a coloured pill: a status, a confidentiality level, a role. */
export function Badge({ label, tone = 'neutral' }: BadgeProps) {
  return (
    <View style={[styles.badge, toneStyles[tone].badge]}>
      <Text style={[styles.label, toneStyles[tone].label]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  label: {
    fontSize: fontSizes.caption,
    fontWeight: fontWeights.semibold,
  },
});

const toneStyles = {
  neutral: StyleSheet.create({
    badge: { backgroundColor: colors.neutralBadgeBackground },
    label: { color: colors.neutralBadgeText },
  }),
  positive: StyleSheet.create({
    badge: { backgroundColor: colors.positiveBadgeBackground },
    label: { color: colors.positiveBadgeText },
  }),
  confidential: StyleSheet.create({
    badge: { backgroundColor: colors.confidentialBadgeBackground },
    label: { color: colors.confidentialBadgeText },
  }),
} as const satisfies Record<BadgeTone, unknown>;
