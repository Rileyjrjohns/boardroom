import { createContext, useContext } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { CONNECTIVITY_STATUS } from '@core/application/ports/Connectivity';
import type { Instant } from '@core/domain/value-objects/Instant';

import { useFormatters } from '../format/FormattersProvider';
import { useCoreServices } from '../services/CoreServices';
import { useUiStore, useUiStoreApi } from '../state/uiStore';
import { CORE_TEST_IDS } from '../testIds';
import { colors, fontSizes, spacing } from '../theme/tokens';

import { Button } from './Button';
import { LiveText } from './LiveText';

/**
 * What a feature adds to the banner: lines about the state of its own data, in the block of the
 * banner and on its background. The core declares the slot, the feature implements it, and the
 * composition plugs it in (`BannerNoticesProvider`): the votes tell what the last synchronisation
 * did, and the shared banner does not know the votes.
 */
export interface BannerNotices {
  /**
   * Whether there is something to tell. It is a hook, read by the banner on every render: the
   * banner shows nothing at all when nobody has anything to say.
   */
  useHasNotices(): boolean;
  /** The lines, shown when `useHasNotices` says so. */
  readonly Notices: ComponentType;
}

/** The banner when nothing is plugged into it: it tells what the core knows, and no more. */
const NO_NOTICES: BannerNotices = {
  useHasNotices: () => false,
  Notices: () => null,
};

const BannerNoticesContext = createContext<BannerNotices>(NO_NOTICES);

interface BannerNoticesProviderProps {
  readonly notices: BannerNotices;
  readonly children: ReactNode;
}

/** Plugs what a feature adds to the banner of the screens. */
export function BannerNoticesProvider({ notices, children }: BannerNoticesProviderProps) {
  return <BannerNoticesContext.Provider value={notices}>{children}</BannerNoticesContext.Provider>;
}

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
 * what a feature adds to it (the votes tell what the last synchronisation did), and that local
 * data was reset, which the user is told once the app is open and until they have read it. It is a
 * single block on a single background, with a line per fact, and nothing at all when there is
 * nothing to say.
 *
 * The two facts about the connection are told apart on purpose, and can be true together or
 * apart: the device being offline says what the platform thinks, a saved copy says what the
 * server really answered. A device that says it is online can still fail to reach the server (a
 * saved copy), and one that says it is offline may be about to recover (no copy yet).
 */
export function StatusBanner({ staleSince }: StatusBannerProps) {
  const { t } = useTranslation();
  const { dateTime } = useFormatters();
  const offline = useUiStore((state) => state.connectivity === CONNECTIVITY_STATUS.Offline);
  const reset = useUiStore((state) => state.localDataResetNotice);
  const store = useUiStoreApi();
  const { notices } = useCoreServices();
  const { useHasNotices, Notices } = useContext(BannerNoticesContext);
  const hasNotices = useHasNotices();

  if (!offline && staleSince === undefined && !hasNotices && !reset) return null;

  const acknowledgeReset = (): void => {
    store.getState().dismissLocalDataReset();
    void notices?.acknowledgeLocalDataReset();
  };

  return (
    <View style={styles.banner} testID={CORE_TEST_IDS.statusBanner}>
      {offline ? <OfflineLine /> : null}
      {staleSince === undefined ? null : (
        <View testID={CORE_TEST_IDS.staleBanner}>
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
            testID={CORE_TEST_IDS.localDataResetNotice}
          />
          <Button
            title={t('banner.dismiss')}
            variant="secondary"
            onPress={acknowledgeReset}
            testID={CORE_TEST_IDS.localDataResetDismiss}
          />
        </View>
      ) : null}
      <Notices />
    </View>
  );
}

/** The line that says the device is offline: the same wherever the banner is shown. */
function OfflineLine() {
  const { t } = useTranslation();

  return (
    <LiveText
      message={t('banner.offline')}
      style={styles.text}
      testID={CORE_TEST_IDS.offlineBanner}
    />
  );
}

/**
 * The banner of the screens that are shown before the app is open, the sign-in and the lock screens:
 * the one fact it can tell there is that the device is offline (a sign-in cannot succeed, and the
 * demo's switch is what brings the connection back). There is no data to date, no
 * synchronisation to report and nothing to read yet: the rest of the banner is for the open app.
 * Nothing at all when the device is online.
 */
export function ConnectionBanner() {
  const offline = useUiStore((state) => state.connectivity === CONNECTIVITY_STATUS.Offline);

  return offline ? (
    <View style={styles.banner} testID={CORE_TEST_IDS.statusBanner}>
      <OfflineLine />
    </View>
  ) : null;
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
