import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, spacing } from '../theme/tokens';

interface MessageProps {
  /** The translated text. */
  readonly message: string;
  /** Centred in the space it is given (an empty list), or in line (the end of a list). */
  readonly centered?: boolean;
  readonly testID?: string;
}

/** A line of secondary text on its own: an empty list, the end of a list. */
export function Message({ message, centered = false, testID }: MessageProps) {
  return (
    <View
      style={[styles.container, centered && styles.centered]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  message: {
    textAlign: 'center',
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
