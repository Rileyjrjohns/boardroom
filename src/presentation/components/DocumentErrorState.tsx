import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isRetryableCode } from '@application/shared/retryableCodes';

import { DOCUMENT_ERROR_KEYS } from '../i18n/translationKeys';
import type { DocumentErrorCode } from '../i18n/translationKeys';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

interface DocumentErrorStateProps {
  /** Why the document could not be opened, which decides the message and whether trying again can help. */
  readonly code: DocumentErrorCode;
  /** Called by the retry button, which is shown only when trying again can help. */
  readonly onRetry: () => void;
}

/**
 * Takes the place of a document that could not be opened: the message for the error, in the words
 * of a document (a document that is not on the device cannot be read offline, a document that does
 * not exist is not a meeting that does not), and a button to try again when trying again can help.
 */
export function DocumentErrorState({ code, onRetry }: DocumentErrorStateProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <LiveText
        message={t(DOCUMENT_ERROR_KEYS[code])}
        style={styles.message}
        testID={TEST_IDS.documentError}
      />
      {isRetryableCode(code) ? (
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
