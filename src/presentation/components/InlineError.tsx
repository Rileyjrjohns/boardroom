import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';

interface InlineErrorProps {
  /** The translated message. */
  readonly message: string;
  /** Called by the retry button. Without it, the error is shown with no way to try again. */
  readonly onRetry?: () => void;
  readonly testID?: string;
}

/** An error next to content that is still there: a refresh that failed, a next page that failed. */
export function InlineError({ message, onRetry, testID }: InlineErrorProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container} {...(testID === undefined ? {} : { testID })}>
      <Text accessibilityRole="alert" style={styles.message}>
        {message}
      </Text>
      {onRetry === undefined ? null : (
        <Button title={t('states.retry')} onPress={onRetry} testID={TEST_IDS.retryButton} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  message: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
