import { colors, fontWeights, pressedOpacity, spacing, touchTarget } from './tokens';

describe('the design tokens', () => {
  it('keeps the smallest touch target at 44 points', () => {
    expect(touchTarget.min).toBe(44);
  });

  it('keeps a pressed element visibly faded, and still readable', () => {
    expect(pressedOpacity).toBeGreaterThan(0.3);
    expect(pressedOpacity).toBeLessThan(1);
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
