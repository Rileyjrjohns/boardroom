import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useErrorCatalog } from '../errors/ErrorCatalog';
import { CORE_TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

interface InlineErrorProps {
  /** The code of the error, which decides the message and whether trying again can help. */
  readonly code: string;
  /** Called by the retry button, which is shown only when trying again can help. */
  readonly onRetry?: () => void;
  readonly testID?: string;
}

/**
 * An error next to content that is still there: a refresh that failed, a next page that failed.
 * Only an error that asking again can fix is shown this way, with its retry button; any other is
 * final and replaces the content (see `ErrorState`).
 */
export function InlineError({ code, onRetry, testID }: InlineErrorProps) {
  const { t } = useTranslation();
  const catalog = useErrorCatalog();

  return (
    <View style={styles.container} {...(testID === undefined ? {} : { testID })}>
      <LiveText message={t(catalog.messageKeyOf(code))} style={styles.message} />
      {catalog.isRetryableCode(code) && onRetry !== undefined ? (
        <Button title={t('states.retry')} onPress={onRetry} testID={CORE_TEST_IDS.retryButton} />
      ) : null}
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
