/**
 * The test IDs of the shared components, referenced by the components and by their tests: a raw
 * `testID` literal is a lint error. The ones that depend on an item are built by the functions below.
 * The test IDs of a screen are declared by the feature that owns it; the composition puts them all
 * together (`TEST_IDS` in `src/composition/shell/testIds.ts`).
 */
export const CORE_TEST_IDS = {
  statusBanner: 'status-banner',
  offlineBanner: 'offline-banner',
  staleBanner: 'stale-banner',
  retryButton: 'retry-button',
  refreshError: 'refresh-error',
  demoPanel: 'demo-panel',
  demoAccounts: 'demo-accounts',
  demoOfflineSwitch: 'demo-offline-switch',
  privacyCover: 'privacy-cover',
  appContent: 'app-content',
  localDataResetNotice: 'local-data-reset-notice',
  localDataResetDismiss: 'local-data-reset-dismiss',
} as const;

const DEMO_ACCOUNT_PREFIX = 'demo-account-';

/** The button that fills in the credentials of a demo account, named after its email address. */
export const demoAccountTestId = (email: string): string => `${DEMO_ACCOUNT_PREFIX}${email}`;
