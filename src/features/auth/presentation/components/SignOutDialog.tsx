import { useTranslation } from 'react-i18next';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@core/presentation/components/Button';
import { Dialog } from '@core/presentation/components/Dialog';
import { LiveText } from '@core/presentation/components/LiveText';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { translateCount } from '@core/presentation/i18n/translateCount';
import { TEST_IDS } from '@core/presentation/testIds';
import { colors, fontSizes } from '@core/presentation/theme/tokens';

import { useSignOut } from '../hooks/useSignOut';

interface SignOutDialogProps {
  readonly visible: boolean;
  readonly onDismiss: () => void;
  /**
   * How many votes wait in the outbox, if the screen knows. The lock screen cannot: the outbox is
   * out of reach while the app is locked, so it passes `undefined` and the dialog says it in
   * general terms.
   */
  readonly pendingCount: number | undefined;
}

/**
 * The confirmation of a sign-out. It says what the user needs to know before leaving: they will
 * have to sign in again, and the votes that still wait to be sent are not lost, they stay on this
 * device and go out after the next sign-in. Confirming signs out and leaves the screen, so the
 * dialog never outlives the session it closes.
 */
export function SignOutDialog({ visible, onDismiss, pendingCount }: SignOutDialogProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const { run, reset, isPending, failure } = useSignOut();

  const dismiss = () => {
    if (isPending) return;
    reset();
    onDismiss();
  };
  const confirm = () => {
    run();
  };

  return (
    <Dialog
      visible={visible}
      title={t('signOut.title')}
      onDismiss={dismiss}
      testID={TEST_IDS.signOutDialog}
      actions={
        <>
          <Button
            title={t('common.cancel')}
            variant="secondary"
            disabled={isPending}
            onPress={dismiss}
            testID={TEST_IDS.signOutCancel}
          />
          <Button
            title={isPending ? t('signOut.signingOut') : t('signOut.action')}
            variant="danger"
            busy={isPending}
            onPress={confirm}
            testID={TEST_IDS.signOutConfirm}
          />
        </>
      }
    >
      <Text style={styles.text}>{t('signOut.message')}</Text>
      {pendingCount === undefined ? (
        <Text style={styles.text} testID={TEST_IDS.signOutPending}>
          {t('signOut.pendingUnknown')}
        </Text>
      ) : pendingCount > 0 ? (
        <Text style={styles.text} testID={TEST_IDS.signOutPending}>
          {translateCount(t, 'signOut.pending', pendingCount, number)}
        </Text>
      ) : null}
      {failure === undefined ? null : (
        <LiveText
          message={t('signOut.failed')}
          style={styles.error}
          testID={TEST_IDS.signOutError}
        />
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: fontSizes.body,
    color: colors.textPrimary,
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
