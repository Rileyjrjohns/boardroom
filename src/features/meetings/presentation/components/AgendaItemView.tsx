import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { ReactNode } from 'react';

import type { Instant } from '@core/domain/value-objects/Instant';
import { colors, fontSizes, fontWeights, spacing } from '@core/presentation/theme/tokens';
import type { AgendaItem } from '@features/meetings/domain/entities/AgendaItem';
import type { Resolution } from '@features/meetings/domain/entities/Resolution';

import { agendaItemTestId } from '../testIds';

import { ResolutionView } from './ResolutionView';

interface AgendaItemViewProps {
  readonly item: AgendaItem;
  /** The instant the data was produced at, for the state of the vote (see `ResolutionView`). */
  readonly now: Instant;
  /**
   * What a feature adds under the resolution of the item (see `ResolutionActionsSlot`). Without it
   * the resolution is display only.
   */
  readonly renderActions?: (resolution: Resolution) => ReactNode;
}

/** One point of the agenda, numbered by its position, with its resolution when it has one. */
export function AgendaItemView({ item, now, renderActions }: AgendaItemViewProps) {
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
        <ResolutionView
          resolution={item.resolution}
          now={now}
          {...(renderActions === undefined ? {} : { actions: renderActions(item.resolution) })}
        />
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
