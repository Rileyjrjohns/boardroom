import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@core/presentation/components/Button';
import { Dialog } from '@core/presentation/components/Dialog';
import { LiveText } from '@core/presentation/components/LiveText';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { translateCount } from '@core/presentation/i18n/translateCount';
import { DISCARD_ERROR_KEYS } from '@core/presentation/i18n/translationKeys';
import { TEST_IDS } from '@core/presentation/testIds';
import { colors, fontSizes, spacing } from '@core/presentation/theme/tokens';

import { useDiscardUnreadableVotes } from '../hooks/useDiscardUnreadableVotes';

interface UnreadableVotesNoticeProps {
  /** How many saved votes of the user can no longer be read. The notice is for one or more. */
  readonly count: number;
}

/**
 * Tells the user that some of their saved votes can no longer be read, and offers to delete them.
 * Such an entry is kept, not sent and not shown, because it may be the only trace of a vote: the
 * notice says so, says how many there are, and leaves it to the user to check on the meeting that
 * their vote was recorded. Deleting is irreversible, so it asks for a confirmation that repeats
 * the count; the outbox is read again afterwards, and the notice goes when nothing is left.
 */
export function UnreadableVotesNotice({ count }: UnreadableVotesNoticeProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const [asking, setAsking] = useState(false);
  const { run, reset, isPending, failure } = useDiscardUnreadableVotes();

  const dismiss = () => {
    if (isPending) return;
    reset();
    setAsking(false);
  };

  return (
    <View style={styles.notice} testID={TEST_IDS.unreadableVotes}>
      <Text style={styles.text}>{translateCount(t, 'pendingVotes.unreadable', count, number)}</Text>
      <Button
        title={t('pendingVotes.discard')}
        variant="secondary"
        accessibilityHint={t('pendingVotes.discardHint')}
        onPress={() => {
          setAsking(true);
        }}
        testID={TEST_IDS.unreadableVotesDiscard}
      />
      <Dialog
        visible={asking}
        title={t('pendingVotes.discardTitle')}
        onDismiss={dismiss}
        testID={TEST_IDS.unreadableVotesDialog}
        actions={
          <>
            <Button
              title={t('common.cancel')}
              variant="secondary"
              disabled={isPending}
              onPress={dismiss}
              testID={TEST_IDS.unreadableVotesCancel}
            />
            <Button
              title={isPending ? t('pendingVotes.discarding') : t('pendingVotes.discard')}
              variant="danger"
              busy={isPending}
              onPress={() => {
                run();
              }}
              testID={TEST_IDS.unreadableVotesConfirm}
            />
          </>
        }
      >
        <Text style={styles.text}>
          {translateCount(t, 'pendingVotes.discardMessage', count, number)}
        </Text>
        {failure === undefined ? null : (
          <LiveText
            message={t(DISCARD_ERROR_KEYS[failure.code])}
            style={styles.error}
            testID={TEST_IDS.unreadableVotesError}
          />
        )}
      </Dialog>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.warningBackground,
  },
  text: {
    fontSize: fontSizes.body,
    color: colors.warningText,
  },
  error: {
    fontSize: fontSizes.body,
    color: colors.danger,
  },
});
