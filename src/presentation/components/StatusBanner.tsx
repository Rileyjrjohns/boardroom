import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CONNECTIVITY_STATUS } from '@application/ports/Connectivity';
import type { Instant } from '@domain/value-objects/Instant';

import { useFormatters } from '../format/FormattersProvider';
import { translateCount } from '../i18n/translateCount';
import { useAppServices } from '../services/AppServices';
import { useUiStore, useUiStoreApi } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

interface StatusBannerProps {
  /**
   * When the data on the screen was saved, if what is shown is a saved copy (the server could not
   * be reached). A screen with no data of its own to date passes nothing.
   */
  readonly staleSince?: Instant;
}

/**
 * The one banner area of a screen, at its top, for what the user should know about the state of
 * the data: that the device is offline, that what is shown is a saved copy and since when, and
 * what the last synchronisation of the votes did, and that local data was reset, which the user
 * is told once the app is open and until they have read it. It is a single block on a single background,
 * with a line per fact, and nothing at all when there is nothing to say.
 *
 * The two facts about the connection are told apart on purpose, and can be true together or
 * apart: the device being offline says what the platform thinks, a saved copy says what the
 * server really answered. A device that says it is online can still fail to reach the server (a
 * saved copy), and one that says it is offline may be about to recover (no copy yet).
 */
export function StatusBanner({ staleSince }: StatusBannerProps) {
  const { t } = useTranslation();
  const { dateTime, number } = useFormatters();
  const offline = useUiStore((state) => state.connectivity === CONNECTIVITY_STATUS.Offline);
  const summary = useUiStore((state) => state.syncSummary);
  const dismissSummary = useUiStore((state) => state.dismissSyncSummary);
  const reset = useUiStore((state) => state.localDataResetNotice);
  const store = useUiStoreApi();
  const { notices } = useAppServices();

  if (!offline && staleSince === undefined && summary === undefined && !reset) return null;

  const acknowledgeReset = (): void => {
    store.getState().dismissLocalDataReset();
    void notices?.acknowledgeLocalDataReset();
  };

  return (
    <View style={styles.banner} testID={TEST_IDS.statusBanner}>
      {offline ? (
        <LiveText
          message={t('banner.offline')}
          style={styles.text}
          testID={TEST_IDS.offlineBanner}
        />
      ) : null}
      {staleSince === undefined ? null : (
        <View testID={TEST_IDS.staleBanner}>
          <LiveText
            message={t('states.staleData', { date: dateTime(staleSince) })}
            style={styles.text}
          />
        </View>
      )}
      {reset ? (
        <View style={styles.summary}>
          <LiveText
            message={t('banner.localDataReset')}
            style={styles.text}
            testID={TEST_IDS.localDataResetNotice}
          />
          <Button
            title={t('banner.dismiss')}
            variant="secondary"
            onPress={acknowledgeReset}
            testID={TEST_IDS.localDataResetDismiss}
          />
        </View>
      ) : null}
      {summary === undefined ? null : (
        <View style={styles.summary} testID={TEST_IDS.syncSummary}>
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
            onPress={dismissSummary}
            testID={TEST_IDS.syncSummaryDismiss}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.warningBackground,
  },
  summary: {
    gap: spacing.sm,
  },
  text: {
    fontSize: fontSizes.caption,
    color: colors.warningText,
  },
});
