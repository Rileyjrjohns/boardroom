import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import type { ResolutionId } from '@core/domain/value-objects/ids';
import { Button } from '@core/presentation/components/Button';
import { LiveText } from '@core/presentation/components/LiveText';
import { ACKNOWLEDGE_ERROR_KEYS } from '@core/presentation/i18n/translationKeys';
import { acknowledgeTestId } from '@core/presentation/testIds';
import { colors, fontSizes, spacing } from '@core/presentation/theme/tokens';

import { useAcknowledgeRejectedVote } from '../hooks/useAcknowledgeRejectedVote';

interface AcknowledgeButtonProps {
  readonly resolutionId: ResolutionId;
}

/**
 * "I have seen it": deletes the rejected vote on a resolution from the outbox. A rejected vote
 * blocks a new one until it is acknowledged, so it is offered wherever the rejection is told (the
 * resolution, the list of pending votes). If the vote cannot be removed the reason is told next
 * to the button.
 */
export function AcknowledgeButton({ resolutionId }: AcknowledgeButtonProps) {
  const { t } = useTranslation();
  const { run, isPending, failure } = useAcknowledgeRejectedVote();

  return (
    <View style={styles.container}>
      <Button
        title={t('voting.acknowledge')}
        variant="secondary"
        busy={isPending}
        accessibilityHint={t('voting.acknowledgeHint')}
        onPress={() => {
          run({ resolutionId });
        }}
        testID={acknowledgeTestId(resolutionId)}
      />
      {failure === undefined ? null : (
        <LiveText message={t(ACKNOWLEDGE_ERROR_KEYS[failure.code])} style={styles.error} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  error: {
    fontSize: fontSizes.caption,
    color: colors.danger,
  },
});
