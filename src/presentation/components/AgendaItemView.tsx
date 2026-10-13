import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { AgendaItem } from '@domain/entities/AgendaItem';
import type { Instant } from '@domain/value-objects/Instant';

import { agendaItemTestId } from '../testIds';
import { colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

import { ResolutionView } from './ResolutionView';

interface AgendaItemViewProps {
  readonly item: AgendaItem;
  /** The instant the data was produced at, for the state of the vote (see `ResolutionView`). */
  readonly now: Instant;
}

/** One point of the agenda, numbered by its position, with its resolution when it has one. */
export function AgendaItemView({ item, now }: AgendaItemViewProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.item} testID={agendaItemTestId(item.id)}>
      <Text style={styles.title}>
        {t('meeting.agendaItem', { position: item.position, title: item.title })}
      </Text>
      {item.description === undefined ? null : (
        <Text style={styles.description}>{item.description}</Text>
      )}
      {item.resolution === undefined ? null : (
        <ResolutionView resolution={item.resolution} now={now} />
      )}
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
