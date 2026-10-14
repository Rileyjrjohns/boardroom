import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { CaptureNotice as CaptureNoticeValue } from '../hooks/useScreenCaptureNotice';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

interface CaptureNoticeProps {
  readonly notice: CaptureNoticeValue;
  readonly onDismiss: () => void;
}

/**
 * Tells the reader that a screenshot or a recording of the screen was seen, and that it was
 * recorded. Calm on purpose: it states what happened, it does not accuse (a reader may well have
 * taken the screenshot by accident). It is announced to the screen reader when it appears, and
 * again for each new capture, since the words are the same: the `key` makes each notice a new
 * one for the live region.
 */
export function CaptureNotice({ notice, onDismiss }: CaptureNoticeProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.container} testID={TEST_IDS.documentCaptureNotice}>
      <LiveText key={notice.sequence} message={t(notice.message)} style={styles.message} />
      <Button
        title={t('banner.dismiss')}
        variant="secondary"
        onPress={onDismiss}
        testID={TEST_IDS.documentCaptureDismiss}
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
