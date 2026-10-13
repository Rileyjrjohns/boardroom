import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors, spacing } from '../theme/tokens';

interface LoadingStateProps {
  /** The translated name of what is loading, read by the screen reader. */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** A spinner that tells the screen reader what it is waiting for. */
export function LoadingState({ accessibilityLabel, testID }: LoadingStateProps) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={styles.container}
      {...(testID === undefined ? {} : { testID })}
    >
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
