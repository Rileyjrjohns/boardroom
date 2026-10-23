import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, spacing } from '@core/presentation/theme/tokens';
import { SHELL_TEST_IDS } from '@composition/shell/testIds';

interface StartupFailureScreenProps {
  /** The code of the error that stopped the composition root. A technical value, shown as is. */
  readonly code: string;
}

/**
 * Shown instead of the app when the composition root could not be built: a setting that names a
 * way of wiring that does not exist, an address of the API that cannot be used, or the local
 * database that cannot be opened. It is an error for the person who runs the app, not for a user,
 * so it says what to check and gives the technical code.
 */
export function StartupFailureScreen({ code }: StartupFailureScreenProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.screen} testID={SHELL_TEST_IDS.startupFailure}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('startup.title')}
      </Text>
      <Text style={styles.message}>{t('startup.message')}</Text>
      <Text style={styles.code}>{t('startup.code', { code })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  message: {
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  code: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
