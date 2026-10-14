import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '../components/Button';
import { LiveText } from '../components/LiveText';
import { SessionNotice } from '../components/SessionNotice';
import { SignOutDialog } from '../components/SignOutDialog';
import { useUnlockApp } from '../hooks/useUnlockApp';
import { UNLOCK_ERROR_KEYS } from '../i18n/translationKeys';
import { useUiStore } from '../state/uiStore';
import { TEST_IDS } from '../testIds';
import { colors, fontSizes, fontWeights, maxContentWidth, spacing } from '../theme/tokens';

/**
 * The lock screen: shown after a restored session and whenever the lock is required on the way back
 * from the background. It shows nothing of the user, no name and no meeting: only that the app is
 * locked and the one action that unlocks it, which asks for the biometric proof of the device.
 *
 * Each outcome of the prompt has its message (cancelled, not recognised, locked out, unavailable,
 * not enrolled). The rule when the biometrics cannot be used is that nothing else unlocks the app:
 * the only way forward is to sign out and sign in again, which is why signing out is offered here,
 * always. The confirmation cannot say how many votes wait, since the outbox is out of reach while
 * the app is locked, and says in general terms that they are kept.
 */
export function LockScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const endedBy = useUiStore((state) => state.sessionEndedBy);
  const unlock = useUnlockApp();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <View
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      testID={TEST_IDS.lockScreen}
    >
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('lock.title')}
        </Text>
        <Text style={styles.message}>{t('lock.message')}</Text>
        {endedBy === undefined ? null : <SessionNotice code={endedBy} />}
        {unlock.failure === undefined ? null : (
          <LiveText
            message={t(UNLOCK_ERROR_KEYS[unlock.failure.code])}
            style={styles.error}
            testID={TEST_IDS.lockError}
          />
        )}
        <Button
          title={unlock.isPending ? t('lock.unlocking') : t('lock.unlock')}
          busy={unlock.isPending}
          accessibilityHint={t('lock.unlockHint')}
          onPress={() => {
            unlock.run();
          }}
          testID={TEST_IDS.lockUnlock}
        />
        <Button
          title={t('signOut.action')}
          variant="secondary"
          accessibilityHint={t('signOut.hint')}
          onPress={() => {
            setSigningOut(true);
          }}
          testID={TEST_IDS.lockSignOut}
        />
      </View>
      <SignOutDialog
        visible={signingOut}
        pendingCount={undefined}
        onDismiss={() => {
          setSigningOut(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  content: {
    width: '100%',
    maxWidth: maxContentWidth.form,
    alignSelf: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSizes.title,
    fontWeight: fontWeights.bold,
    color: colors.textPrimary,
  },
  message: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
