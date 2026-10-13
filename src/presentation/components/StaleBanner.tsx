import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { Instant } from '@domain/value-objects/Instant';

import { useFormatters } from '../format/FormattersProvider';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { LiveText } from './LiveText';

interface StaleBannerProps {
  /** When the data on the screen was saved. */
  readonly cachedAt: Instant;
}

/**
 * Says that what is on the screen is a saved copy, and from when. It is shown whenever the data
 * comes from the cache of the device (the server could not be reached), so that nobody reads an old
 * agenda believing it is today's. For a list of several pages it is the oldest saved page that
 * dates the banner: one saved page is enough to make the whole list possibly out of date, and the
 * rows are not told apart.
 */
export function StaleBanner({ cachedAt }: StaleBannerProps) {
  const { t } = useTranslation();
  const { dateTime } = useFormatters();

  return (
    <View style={styles.banner} testID={TEST_IDS.staleBanner}>
      <LiveText message={t('states.staleData', { date: dateTime(cachedAt) })} style={styles.text} />
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
