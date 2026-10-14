import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights } from '../theme/tokens';

/**
 * What hides the content while the app is inactive or in the background, so that the snapshot the
 * system takes for the app switcher shows nothing confidential. It shows the name of the app and
 * nothing else, on a neutral background: no title of a meeting, no name, no number.
 *
 * It is the JavaScript-level fallback: the native screen protection of the document viewer step
 * replaces it on iOS, where the system takes the snapshot as the app goes inactive and may do so
 * before the next render. It is a view of the root and is covered by nothing, which is why the
 * dialogs, which are windows of their own, show it in their place (see `Dialog`).
 */
export function PrivacyCover() {
  const { t } = useTranslation();

  return (
    <View
      accessible
      accessibilityLabel={t('privacy.hidden')}
      accessibilityViewIsModal
      style={[StyleSheet.absoluteFill, styles.cover]}
      testID={TEST_IDS.privacyCover}
    >
      <Text style={styles.name}>{t('app.name')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  name: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textSecondary,
  },
});
