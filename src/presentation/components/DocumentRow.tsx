import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Document } from '@domain/entities/Document';
import type { DocumentId } from '@domain/value-objects/ids';

import { useFormatters } from '../format/FormattersProvider';
import { CONFIDENTIALITY_KEYS } from '../i18n/translationKeys';
import { translateCount } from '../i18n/translateCount';
import { documentTestId } from '../testIds';
import {
  borderWidths,
  colors,
  fontSizes,
  fontWeights,
  pressedOpacity,
  spacing,
  touchTarget,
} from '../theme/tokens';

import { Badge } from './Badge';
import { CONFIDENTIALITY_TONES } from './badgeTones';

interface DocumentRowProps {
  readonly document: Document;
  /** Opens the document in the viewer. */
  readonly onOpen: (id: DocumentId) => void;
}

/**
 * A document attached to a meeting: title, confidentiality, number of pages. The whole row is a
 * button that opens the document. A screen reader hears it as one thing, with a name that says all
 * three facts (the visible texts inside a button are not read one by one), and a hint that says
 * where it leads.
 */
export function DocumentRow({ document, onOpen }: DocumentRowProps) {
  const { t } = useTranslation();
  const { number } = useFormatters();
  const pages = translateCount(t, 'meeting.pageCount', document.pageCount, number);
  const confidentiality = t(CONFIDENTIALITY_KEYS[document.confidentiality]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('meeting.documentLabel', {
        title: document.title,
        confidentiality,
        pages,
      })}
      accessibilityHint={t('meeting.openDocumentHint')}
      onPress={() => {
        onOpen(document.id);
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      testID={documentTestId(document.id)}
    >
      <Text style={styles.title}>{document.title}</Text>
      <View style={styles.details}>
        <Badge label={confidentiality} tone={CONFIDENTIALITY_TONES[document.confidentiality]} />
        <Text style={styles.pages}>{pages}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: borderWidths.hairline,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: pressedOpacity,
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
