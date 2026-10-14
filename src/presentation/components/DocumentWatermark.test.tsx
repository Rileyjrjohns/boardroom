import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { createWatermark } from '@domain/value-objects/Watermark';
import { NOW, aUser } from '@domain/testing/builders';

import { createFormatters } from '../format/formatters';
import { TEST_IDS } from '../testIds';
import { renderScreen } from '../testing/renderScreen';
import { colors, watermark as tokens } from '../theme/tokens';

import { DocumentWatermark, watermarkLines } from './DocumentWatermark';

const READER = createWatermark(aUser(), NOW);
const HIDDEN = { includeHiddenElements: true } as const;

function renderWatermark(language: 'en' | 'fr' = 'en') {
  return renderScreen(<DocumentWatermark watermark={READER} />, { language });
}

const overlay = () => screen.getByTestId(TEST_IDS.documentWatermark, HIDDEN);
const tiles = () => screen.getAllByTestId(TEST_IDS.documentWatermarkTile, HIDDEN);

/** The area of the page, as the layout would report it. */
function layOut(width: number, height: number): void {
  fireEvent(overlay(), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

/** How many rows and columns of tiles cover an area, as the component computes them. */
function gridFor(width: number, height: number) {
  const diagonal = Math.ceil(Math.hypot(width, height));
  return {
    diagonal,
    rows: Math.ceil(diagonal / tokens.tileHeight),
    columns: Math.ceil(diagonal / tokens.tileWidth) + 1,
  };
}

describe('watermarkLines', () => {
  it('says the full name, the email and the moment, written by the function it is given', () => {
    const lines = watermarkLines(READER, (instant) => `at ${instant}`);

    expect(lines).toEqual([READER.fullName, READER.email, `at ${NOW}`]);
  });
});

describe('DocumentWatermark', () => {
  describe('the text', () => {
    it('is the name, the email and the moment of the opening, one under the other, on every tile', () => {
      const { format } = renderWatermark();

      for (const tile of tiles()) {
        expect(tile).toHaveTextContent(
          [READER.fullName, READER.email, format.dateTime(NOW)].join('\n'),
          {
            exact: true,
          },
        );
      }
    });

    it('writes the moment for the locale of the app', () => {
      const english = renderWatermark('en');
      const inEnglish = createFormatters('en').dateTime(NOW);
      expect(tiles()[0]).toHaveTextContent(inEnglish, { exact: false });
      english.unmount();

      renderWatermark('fr');

      const inFrench = createFormatters('fr').dateTime(NOW);
      expect(inFrench).not.toBe(inEnglish);
      expect(tiles()[0]).toHaveTextContent(inFrench, { exact: false });
    });

    it('is the watermark of the domain and nothing more', () => {
      renderWatermark();

      expect(JSON.stringify(screen.toJSON())).not.toMatch(/user-1|password|token/i);
    });
  });

  describe('the tiling', () => {
    it('covers the window before the area is measured, so the page is never bare', () => {
      renderWatermark();

      expect(tiles().length).toBeGreaterThan(20);
    });

    it('covers the diagonal of the area once it is measured: rows and columns of tiles, one more column for the shifted rows', () => {
      renderWatermark();

      layOut(400, 800);

      const { rows, columns } = gridFor(400, 800);
      expect(tiles()).toHaveLength(rows * columns);
    });

    it('adds tiles when the area grows and removes them when it shrinks', () => {
      renderWatermark();
      layOut(400, 800);
      const small = tiles().length;

      layOut(800, 1600);
      const large = tiles().length;
      layOut(400, 800);

      expect(large).toBeGreaterThan(small);
      expect(tiles()).toHaveLength(small);
    });

    it('turns the grid by the angle of the tokens, on a square as big as the diagonal, centred on the area', () => {
      renderWatermark();
      layOut(400, 800);

      const grid = StyleSheet.flatten(overlay().props.children.props.style);
      const { diagonal } = gridFor(400, 800);

      expect(grid.transform).toEqual([{ rotate: `${tokens.angleDegrees}deg` }]);
      expect(grid.width).toBe(diagonal);
      expect(grid.height).toBe(diagonal);
      expect(grid.left).toBe((400 - diagonal) / 2);
      expect(grid.top).toBe((800 - diagonal) / 2);
    });

    it('shifts every other row by half a tile', () => {
      renderWatermark();
      layOut(400, 800);

      const rows = overlay().props.children.props.children as { props: { style: unknown } }[];
      const margins = rows
        .slice(0, 4)
        .map(
          (row) =>
            (StyleSheet.flatten(row.props.style as never) as { marginLeft?: number }).marginLeft,
        );

      expect(margins).toEqual([undefined, -tokens.tileWidth / 2, undefined, -tokens.tileWidth / 2]);
    });

    it('sizes each tile and draws it faint, in the colour of the tokens', () => {
      renderWatermark();

      const tile = StyleSheet.flatten(tiles()[0]?.props.style);

      expect(tile).toMatchObject({
        width: tokens.tileWidth,
        height: tokens.tileHeight,
        fontSize: tokens.fontSize,
        color: colors.watermarkText,
        opacity: tokens.opacity,
      });
      expect(tokens.opacity).toBeGreaterThan(0);
      expect(tokens.opacity).toBeLessThan(0.5);
    });

    it('slants the text, so that it cannot be cropped out with a straight cut', () => {
      expect(tokens.angleDegrees % 90).not.toBe(0);
    });
  });

  describe('being in the way', () => {
    it('takes no touch: the page under it scrolls, zooms and follows links as if it were not there', () => {
      renderWatermark();

      expect(overlay().props.pointerEvents).toBe('none');
    });

    it('fills the area it is put over, and is clipped to it', () => {
      renderWatermark();

      expect(StyleSheet.flatten(overlay().props.style)).toMatchObject({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      });
    });

    it('is hidden from the screen reader on both platforms, so a name repeated forty times is not read out', () => {
      renderWatermark();

      expect(overlay().props.accessibilityElementsHidden).toBe(true);
      expect(overlay().props.importantForAccessibility).toBe('no-hide-descendants');
      expect(screen.queryByTestId(TEST_IDS.documentWatermark)).toBeNull();
      expect(screen.queryAllByTestId(TEST_IDS.documentWatermarkTile)).toEqual([]);
    });
  });
});
