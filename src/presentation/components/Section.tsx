import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

interface SectionProps {
  /** The translated heading, announced as a heading by the screen reader. */
  readonly title: string;
  readonly children: ReactNode;
  readonly testID?: string;
}

/** A titled part of a screen. */
export function Section({ title, children, testID }: SectionProps) {
  return (
    <View style={styles.section} {...(testID === undefined ? {} : { testID })}>
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  title: {
    fontSize: fontSizes.subtitle,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
});
