import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useAnnounce } from '../accessibility/useAnnounce';
import { colors, spacing } from '../theme/tokens';

interface LoadingStateProps {
  /** The translated name of what is loading, read by the screen reader. */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/**
 * A spinner that tells the screen reader what it is waiting for: a progress bar with a label, busy,
 * announced when it appears (on iOS, see `useAnnounce`; a polite live region on Android).
 */
export function LoadingState({ accessibilityLabel, testID }: LoadingStateProps) {
  useAnnounce(accessibilityLabel);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      accessibilityState={{ busy: true }}
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
