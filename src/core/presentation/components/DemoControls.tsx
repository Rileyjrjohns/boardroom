import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { useCoreServices } from '../services/CoreServices';
import type { DemoAccount, DemoNetwork } from '../services/CoreServices';
import { CORE_TEST_IDS, demoAccountTestId } from '../testIds';
import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  pressedOpacity,
  radii,
  spacing,
  touchTarget,
} from '../theme/tokens';

import { Badge } from './Badge';
import { Button } from './Button';

/**
 * The switch of the simulated server, in a small area marked as the demo: it drives the whole
 * offline scenario (go offline, open a meeting already seen, vote, see it queued, go online, see
 * it sent) in the running app. It renders nothing when the services have no demo controls, which
 * is every configuration but the mock one: a real device has no switch to cut its own network.
 */
export function DemoOfflineSwitch() {
  const { demoControls } = useCoreServices();

  return demoControls === undefined ? null : <OfflineSwitch network={demoControls.network} />;
}

function OfflineSwitch({ network }: { readonly network: DemoNetwork }) {
  const { t } = useTranslation();
  const subscribe = useCallback(
    (onChange: () => void) => network.subscribe(() => onChange()),
    [network],
  );
  const online = useSyncExternalStore(subscribe, () => network.online);
  const offline = !online;

  return (
    <View style={styles.bar} testID={CORE_TEST_IDS.demoPanel}>
      <Badge label={t('demo.badge')} />
      <Pressable
        accessibilityHint={t('demo.offlineHint')}
        accessibilityLabel={t('demo.offline')}
        accessibilityRole="switch"
        accessibilityState={{ checked: offline }}
        onPress={() => {
          network.setOnline(offline);
        }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        testID={CORE_TEST_IDS.demoOfflineSwitch}
      >
        <Text style={styles.label}>{t('demo.offline')}</Text>
        {/* The row is the control; the native switch only draws its state. */}
        <Switch
          accessibilityElementsHidden
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          trackColor={{ false: colors.interactiveBorder, true: colors.primary }}
          value={offline}
        />
      </Pressable>
    </View>
  );
}

interface DemoAccountsProps {
  /** Called with the account the user touched, to fill in the form. */
  readonly onPick: (account: DemoAccount) => void;
}

/**
 * The accounts of the simulated server, as a discreet helper under the sign-in form: touching one
 * fills in its email address and password. They come from the demo controls of the services, so
 * they exist in the mock configuration only, and this renders nothing in any other.
 */
export function DemoAccounts({ onPick }: DemoAccountsProps) {
  const { t } = useTranslation();
  const { demoControls } = useCoreServices();

  if (demoControls === undefined) return null;
  return (
    <View style={styles.panel} testID={CORE_TEST_IDS.demoAccounts}>
      <View style={styles.heading}>
        <Badge label={t('demo.badge')} />
        <Text accessibilityRole="header" style={styles.label}>
          {t('demo.accounts')}
        </Text>
      </View>
      <Text style={styles.hint}>{t('demo.accountsHint')}</Text>
      {demoControls.accounts.map((account) => (
        <Button
          key={account.email}
          title={t('demo.useAccount', { name: account.fullName })}
          variant="secondary"
          onPress={() => {
            onPick(account);
          }}
          testID={demoAccountTestId(account.email)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: borderWidths.hairline,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  panel: {
    gap: spacing.sm,
    margin: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidths.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  row: {
    flex: 1,
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  label: {
    flexShrink: 1,
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  hint: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
