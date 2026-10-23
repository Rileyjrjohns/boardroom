import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Badge } from '@core/presentation/components/Badge';
import { useFormatters } from '@core/presentation/format/FormattersProvider';
import { TEST_IDS } from '@core/presentation/testIds';
import {
  colors,
  fontSizes,
  fontWeights,
  pressedOpacity,
  spacing,
  touchTarget,
} from '@core/presentation/theme/tokens';
import { SignOutDialog } from '@features/auth/presentation/components/SignOutDialog';
import { usePendingVotes } from '@features/votes/presentation/hooks/usePendingVotes';
import { useOpenPendingVotes } from '@features/votes/presentation/navigation/useOpenPendingVotes';

/**
 * The actions in the header of the meetings list: the votes that are not settled, with a count
 * when there are some, and signing out, which asks for a confirmation first. The count is the
 * outbox: the votes waiting to be sent and the rejected ones the user has not acknowledged.
 */
export function HeaderActions() {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const openPendingVotes = useOpenPendingVotes();
  const { data } = usePendingVotes();
  const [signingOut, setSigningOut] = useState(false);
  const count = data === undefined ? 0 : data.pending.length + data.rejected.length;

  return (
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel={
          count === 0
            ? t('pendingVotes.open')
            : t('pendingVotes.openWithCount', { number: number(count) })
        }
        accessibilityRole="button"
        onPress={openPendingVotes}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        testID={TEST_IDS.pendingVotesButton}
      >
        <Text style={styles.label}>{t('pendingVotes.open')}</Text>
        {count === 0 ? null : (
          <View testID={TEST_IDS.pendingVotesBadge}>
            <Badge label={number(count)} tone="confidential" />
          </View>
        )}
      </Pressable>
      <Pressable
        accessibilityHint={t('signOut.hint')}
        accessibilityRole="button"
        onPress={() => {
          setSigningOut(true);
        }}
        style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        testID={TEST_IDS.signOutButton}
      >
        <Text style={styles.label}>{t('signOut.action')}</Text>
      </Pressable>
      <SignOutDialog
        visible={signingOut}
        pendingCount={data?.pending.length}
        onDismiss={() => {
          setSigningOut(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  action: {
    minHeight: touchTarget.min,
    minWidth: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  pressed: {
    opacity: pressedOpacity,
  },
  label: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.primary,
  },
});
