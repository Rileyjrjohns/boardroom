import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { Document } from '@domain/entities/Document';

import { useFormatters } from '../format/FormattersProvider';
import { CONFIDENTIALITY_KEYS } from '../i18n/translationKeys';
import { translateCount } from '../i18n/translateCount';
import { documentTestId } from '../testIds';
import { borderWidths, colors, fontSizes, fontWeights, spacing } from '../theme/tokens';

import { Badge } from './Badge';
import { CONFIDENTIALITY_TONES } from './badgeTones';

interface DocumentRowProps {
  readonly document: Document;
}

/**
 * A document attached to a meeting: title, confidentiality, number of pages.
 *
 * Display only. Opening a document arrives with step 5 (the viewer, the watermark and the screen
 * protection): the row will then be wrapped in a pressable that calls `OpenDocument`. Until then
 * this component takes no callback, so there is nothing to tap and nothing to disable.
 */
export function DocumentRow({ document }: DocumentRowProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();

  return (
    <View style={styles.row} testID={documentTestId(document.id)}>
      <Text style={styles.title}>{document.title}</Text>
      <View style={styles.details}>
        <Badge
          label={t(CONFIDENTIALITY_KEYS[document.confidentiality])}
          tone={CONFIDENTIALITY_TONES[document.confidentiality]}
        />
        <Text style={styles.pages}>
          {translateCount(t, 'meeting.pageCount', document.pageCount, number)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidths.hairline,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: fontSizes.body,
    fontWeight: fontWeights.semibold,
    color: colors.textPrimary,
  },
  details: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  pages: {
    fontSize: fontSizes.caption,
    color: colors.textSecondary,
  },
});
