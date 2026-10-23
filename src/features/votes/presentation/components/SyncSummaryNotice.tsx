import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@core/presentation/components/Button';
import { LiveText } from '@core/presentation/components/LiveText';
import type { BannerNotices } from '@core/presentation/components/StatusBanner';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { translateCount } from '@core/presentation/i18n/translateCount';
import { colors, fontSizes, spacing } from '@core/presentation/theme/tokens';

import { useVoteSyncStore } from '../state/voteSyncStore';
import { VOTES_TEST_IDS } from '../testIds';

/**
 * What the last synchronisations of the votes did, in the banner of the screens of the open app:
 * how many votes were sent and how many were refused, added up until the user dismisses it.
 * Nothing at all while there is nothing to tell.
 */
export function SyncSummaryNotice() {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const summary = useVoteSyncStore((state) => state.syncSummary);
  const dismiss = useVoteSyncStore((state) => state.dismissSyncSummary);

  if (summary === undefined) return null;
  return (
    <View style={styles.summary} testID={VOTES_TEST_IDS.syncSummary}>
      {summary.synced === 0 ? null : (
        <LiveText
          message={translateCount(t, 'banner.sent', summary.synced, number)}
          style={styles.text}
        />
      )}
      {summary.rejected === 0 ? null : (
        <LiveText
          message={translateCount(t, 'banner.rejected', summary.rejected, number)}
          style={styles.text}
        />
      )}
      <Button
        title={t('banner.dismiss')}
        variant="secondary"
        onPress={dismiss}
        testID={VOTES_TEST_IDS.syncSummaryDismiss}
      />
    </View>
  );
}

/** Whether there is a summary to show: the banner area is empty when nothing else says anything. */
function useHasSyncSummary(): boolean {
  return useVoteSyncStore((state) => state.syncSummary !== undefined);
}

/** What the votes add to the banner of the screens: the slot of the shared banner (`StatusBanner`). */
export const SYNC_SUMMARY_NOTICES: BannerNotices = {
  useHasNotices: useHasSyncSummary,
  Notices: SyncSummaryNotice,
};

const styles = StyleSheet.create({
  summary: {
    gap: spacing.sm,
  },
  text: {
    fontSize: fontSizes.caption,
    color: colors.warningText,
  },
});
