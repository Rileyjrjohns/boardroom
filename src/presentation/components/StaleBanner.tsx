import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Instant } from '@domain/value-objects/Instant';

import { useDateTimeFormatter } from '../format/useDateTimeFormatter';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

interface StaleBannerProps {
  /** When the data on the screen was saved. */
  readonly cachedAt: Instant;
}

/**
 * Says that what is on the screen is a saved copy, and from when. It is shown whenever the data
 * comes from the cache of the device (the server could not be reached), so that nobody reads an old
 * agenda believing it is today's.
 */
export function StaleBanner({ cachedAt }: StaleBannerProps) {
  const { t } = useTranslation();
  const { dateTime } = useDateTimeFormatter();

  return (
    <View style={styles.banner} testID={TEST_IDS.staleBanner}>
      <Text accessibilityRole="alert" style={styles.text}>
        {t('states.staleData', { date: dateTime(cachedAt) })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.warningBackground,
  },
  text: {
    fontSize: fontSizes.caption,
    color: colors.warningText,
  },
});
