import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { AgendaItem } from '@domain/entities/AgendaItem';

import { agendaItemTestId } from '../testIds';
import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

import { ResolutionView } from './ResolutionView';

interface AgendaItemViewProps {
  readonly item: AgendaItem;
}

/** One point of the agenda, numbered by its position, with its resolution when it has one. */
export function AgendaItemView({ item }: AgendaItemViewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.item} testID={agendaItemTestId(item.id)}>
      <Text style={styles.title}>
        {t('meeting.agendaItem', { position: item.position, title: item.title })}
      </Text>
      {item.description === undefined ? null : (
        <Text style={styles.description}>{item.description}</Text>
      )}
      {item.resolution === undefined ? null : <ResolutionView resolution={item.resolution} />}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  description: {
    fontSize: fontSizes.body,
    color: colors.textSecondary,
  },
});
