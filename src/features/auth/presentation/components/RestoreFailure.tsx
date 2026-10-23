import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@core/presentation/components/Button';
import { ErrorState } from '@core/presentation/components/ErrorState';
import { LiveText } from '@core/presentation/components/LiveText';
import type { MeetingsErrorCode } from '@core/presentation/i18n/translationKeys';
import { TEST_IDS } from '@core/presentation/testIds';
import { colors, fontSizes, maxContentWidth, spacing } from '@core/presentation/theme/tokens';

import { useSignOut } from '../hooks/useSignOut';

interface RestoreFailureProps {
  /** Why the session saved on this device could not be read. */
  readonly code: MeetingsErrorCode;
  /** Asks again. */
  readonly onRetry: () => void;
}

/**
 * What the user sees when the session saved on the device cannot be read at the start: the failure,
 * and a way to ask again. Asking again is not always enough (a stored session that stays
 * unreadable would keep the user on this screen for good), so there is a way out as well: signing
 * out on this device, which forgets the session and goes to the sign-in screen. It is behind a
 * sentence that says what it does, and it keeps the votes that wait to be sent, like any sign-out.
 * A sign-out that fails says so and can be asked again.
 */
export function RestoreFailure({ code, onRetry }: RestoreFailureProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <ErrorState code={code} onRetry={onRetry} testID={TEST_IDS.restoreError} />
      <View style={styles.escape}>
        <Text style={styles.text}>{t('startup.forgetExplanation')}</Text>
        {signOut.failure === undefined ? null : (
          <LiveText
            message={t('signOut.failed')}
            style={styles.error}
            testID={TEST_IDS.restoreForgetError}
          />
        )}
        <Button
          title={signOut.isPending ? t('signOut.signingOut') : t('startup.forget')}
          variant="secondary"
          busy={signOut.isPending}
          onPress={signOut.run}
          testID={TEST_IDS.restoreForget}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  escape: {
    width: '100%',
    maxWidth: maxContentWidth.form,
    alignSelf: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  text: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
