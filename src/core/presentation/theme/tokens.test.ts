import {
  colors,
  dimmedOpacity,
  disabledOpacity,
  fontWeights,
  pressedOpacity,
  spacing,
  touchTarget,
} from './tokens';

/** The relative luminance of a colour written as `#rrggbb` (WCAG 2.x). */
function luminance(colour: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = parseInt(colour.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

/** The contrast ratio between two colours, from 1 (the same) to 21 (black on white). */
function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter! + 0.05) / (darker! + 0.05);
}

/** The least contrast WCAG 1.4.11 asks of the parts of a control that tell where it is. */
const MIN_BOUNDARY_CONTRAST = 3;

describe('the design tokens', () => {
  describe('the edge of what the user operates', () => {
    it.each([
      ['the background', colors.background],
      ['the surface', colors.surface],
    ])('holds at least 3:1 against %s', (_name, behind) => {
      expect(contrast(colors.interactiveBorder, behind)).toBeGreaterThanOrEqual(
        MIN_BOUNDARY_CONTRAST,
      );
    });

    it('is not the hairline of the rows, which is decoration and does not hold it', () => {
      expect(colors.interactiveBorder).not.toBe(colors.border);
      expect(contrast(colors.border, colors.background)).toBeLessThan(MIN_BOUNDARY_CONTRAST);
    });

    it('measures contrast the way WCAG does', () => {
      expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
      expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
      expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    });
  });

  it('keeps the smallest touch target at 44 points', () => {
    expect(touchTarget.min).toBe(44);
  });

  it('keeps a pressed element visibly faded, and still readable', () => {
    expect(pressedOpacity).toBeGreaterThan(0.3);
    expect(pressedOpacity).toBeLessThan(1);
  });

  it('fades what cannot be used more than what is pressed, and dims behind a dialog without hiding the screen', () => {
    expect(disabledOpacity).toBeLessThan(pressedOpacity);
    expect(dimmedOpacity).toBeGreaterThan(0.3);
    expect(dimmedOpacity).toBeLessThan(0.8);
  });

  it('spaces things in growing steps', () => {
    const steps = Object.values(spacing);

    expect(steps).toEqual([...steps].sort((first, second) => first - second));
  });

  it('writes every colour as a hexadecimal value', () => {
    for (const colour of Object.values(colors)) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('gives each weight in the form React Native takes', () => {
    expect(Object.values(fontWeights)).toEqual(['600', '700']);
  });
});
