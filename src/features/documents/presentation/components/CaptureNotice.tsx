import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@core/presentation/components/Button';
import { LiveText } from '@core/presentation/components/LiveText';
import { colors, fontSizes, spacing } from '@core/presentation/theme/tokens';

import type { CaptureNotice as CaptureNoticeValue } from '../hooks/useScreenCaptureNotice';
import { DOCUMENTS_TEST_IDS } from '../testIds';

interface CaptureNoticeProps {
  readonly notice: CaptureNoticeValue;
  readonly onDismiss: () => void;
}

/**
 * Tells the reader that a screenshot or a recording of the screen was seen, and that it was
 * recorded. Calm on purpose: it states what happened, it does not accuse (a reader may well have
 * taken the screenshot by accident). It is announced to the screen reader when it appears, and
 * again for each new capture, since the words are the same: the `key` makes each notice a new
 * one for the live region. The id is on the text, the element that renders: a container with no
 * text of its own may not reach the native tree, and a flow that looks for the notice would not
 * find it.
 */
export function CaptureNotice({ notice, onDismiss }: CaptureNoticeProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <LiveText
        key={notice.sequence}
        message={t(notice.message)}
        style={styles.message}
        testID={DOCUMENTS_TEST_IDS.documentCaptureNotice}
      />
      <Button
        title={t('banner.dismiss')}
        variant="secondary"
        onPress={onDismiss}
        testID={DOCUMENTS_TEST_IDS.documentCaptureDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.warningBackground,
  },
  message: {
    fontSize: fontSizes.caption,
    color: colors.warningText,
  },
});
