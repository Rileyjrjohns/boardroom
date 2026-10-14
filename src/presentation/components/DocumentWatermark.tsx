import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';

import type { Instant } from '@domain/value-objects/Instant';
import type { Watermark } from '@domain/value-objects/Watermark';

import { useFormatters } from '../format/FormattersProvider';
import { TEST_IDS } from '../testIds';
import { colors, spacing, watermark } from '../theme/tokens';

interface DocumentWatermarkProps {
  /** What the domain says the page must show: who is reading, and since when. */
  readonly watermark: Watermark;
}

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The text of one tile, line by line: the full name and the email of the reader, and the moment
 * the document was opened, written for the locale of the app. The domain fixes what the watermark
 * says (`Watermark`); how the instant is written is the one thing decided here.
 */
export function watermarkLines(
  { fullName, email, viewedAt }: Watermark,
  formatInstant: (instant: Instant) => string,
): string[] {
  return [fullName, email, formatInstant(viewedAt)];
}

const LINE_BREAK = '\n';
const HALF = 2;

/**
 * Tiles the watermark across the whole area it is put over, slanted, faint, and above the page.
 *
 * - **Diagonal across the whole area.** The tiles are laid out in rows on a square as big as the
 *   diagonal of the area, centred on it and turned by the angle of the tokens, so that after the
 *   turn they still cover every corner. Alternate rows are shifted by half a tile, which keeps a
 *   whole line of text from standing in the same column down the page.
 * - **Faint.** Every tile has the opacity of the tokens: the page stays readable, and the name
 *   stays readable on a screenshot.
 * - **Never in the way.** It takes no touch (`pointerEvents="none"`), so the page under it scrolls,
 *   zooms and follows links as if it were not there.
 * - **Not read out.** It is hidden from screen readers (on iOS and on Android), since a name and an
 *   email repeated forty times says nothing to someone who cannot see the page.
 *
 * The size of the area is measured once it is laid out; until then the size of the window, which
 * the area cannot exceed, is used, so there is never a moment when the page is shown bare.
 */
export function DocumentWatermark({ watermark: reader }: DocumentWatermarkProps) {
  const { dateTime } = useFormatters();
  const window = useWindowDimensions();
  const [measured, setMeasured] = useState<Size | undefined>(undefined);
  const area = measured ?? window;

  const text = useMemo(() => watermarkLines(reader, dateTime).join(LINE_BREAK), [reader, dateTime]);

  const onLayout = (event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setMeasured((previous) =>
      previous?.width === width && previous.height === height ? previous : { width, height },
    );
  };

  const diagonal = Math.ceil(Math.hypot(area.width, area.height));
  const rows = Math.ceil(diagonal / watermark.tileHeight);
  // One tile more than fits, for the rows that are shifted by half a tile.
  const columns = Math.ceil(diagonal / watermark.tileWidth) + 1;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      style={styles.overlay}
      testID={TEST_IDS.documentWatermark}
    >
      <View
        style={{
          position: 'absolute',
          width: diagonal,
          height: diagonal,
          left: (area.width - diagonal) / HALF,
          top: (area.height - diagonal) / HALF,
          transform: [{ rotate: `${watermark.angleDegrees}deg` }],
        }}
      >
        {Array.from({ length: rows }, (_row, row) => (
          <View
            key={row}
            style={[styles.row, row % HALF === 1 && { marginLeft: -watermark.tileWidth / HALF }]}
          >
            {Array.from({ length: columns }, (_column, column) => (
              <Text
                key={column}
                numberOfLines={3}
                style={styles.tile}
                testID={TEST_IDS.documentWatermarkTile}
              >
                {text}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  tile: {
    width: watermark.tileWidth,
    height: watermark.tileHeight,
    paddingHorizontal: spacing.sm,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: watermark.fontSize,
    color: colors.watermarkText,
    opacity: watermark.opacity,
  },
});
