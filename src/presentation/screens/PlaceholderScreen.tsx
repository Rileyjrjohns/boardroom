import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fontSizes, fontWeights, spacing } from '@presentation/theme/tokens';

export function PlaceholderScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('app.name')}
      </Text>
      <Text style={styles.subtitle}>{t('placeholder.message')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
