import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { MEETINGS_ERROR_KEYS } from '../i18n/translationKeys';
import type { MeetingsErrorCode } from '../i18n/translationKeys';
import { isRetryableCode } from '../query/retryPolicy';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

interface ErrorStateProps {
  /** The code of the error, which decides the message and whether trying again can help. */
  readonly code: MeetingsErrorCode;
  /** Called by the retry button, which is shown only when trying again can help. */
  readonly onRetry?: () => void;
  readonly testID?: string;
}

/**
 * Takes the place of content that could not be loaded: the message for the error, and a retry
 * button when trying again can help. A session that is gone or an item that does not exist is not
 * fixed by asking again, so there is no button for those: the failure is final for the screen.
 */
export function ErrorState({ code, onRetry, testID }: ErrorStateProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container} {...(testID === undefined ? {} : { testID })}>
      <LiveText message={t(MEETINGS_ERROR_KEYS[code])} style={styles.message} />
      {isRetryableCode(code) && onRetry !== undefined ? (
        <Button title={t('states.retry')} onPress={onRetry} testID={TEST_IDS.retryButton} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  message: {
    textAlign: 'center',
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
});
