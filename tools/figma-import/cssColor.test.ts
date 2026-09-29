import { describe, expect, it } from 'vitest';
import { parseCssColor } from './cssColor';

describe('CSS color parsing for Figma', () => {
  it('normalizes rgb, alpha and hex channels to the Figma range', () => {
    expect(parseCssColor('rgb(37, 99, 235)')).toEqual({
      r: 37 / 255,
      g: 99 / 255,
      b: 235 / 255,
      opacity: 1,
    });
    expect(parseCssColor('rgba(255, 255, 255, 0.04)')?.opacity).toBe(0.04);
    expect(parseCssColor('#2563eb')).toEqual({
      r: 37 / 255,
      g: 99 / 255,
      b: 235 / 255,
      opacity: 1,
    });
  });

  it('converts Tailwind oklch colors and clamps every channel', () => {
    for (const value of [
      'oklch(0.554 0.046 257.417)',
      'oklch(0.696 0.17 162.48)',
      'oklch(0.828 0.189 84.429 / 25%)',
    ]) {
      const parsed = parseCssColor(value);
      expect(parsed).not.toBeNull();
      expect(
        parsed &&
          [parsed.r, parsed.g, parsed.b, parsed.opacity].every(
            (channel) => channel >= 0 && channel <= 1,
          ),
      ).toBe(true);
    }
  });

  it.each([
    ['oklab(0.54613 -0.0266538 -0.213537 / 0.1)', 0.1],
    ['oklab(0.54613 -0.0266538 -0.213537 / 20%)', 0.2],
  ])('preserves opacity in browser-emitted %s', (value, opacity) => {
    const parsed = parseCssColor(value);
    expect(parsed).not.toBeNull();
    expect(parsed?.opacity).toBeCloseTo(opacity);
    expect(
      parsed && [parsed.r, parsed.g, parsed.b].every((channel) => channel >= 0 && channel <= 1),
    ).toBe(true);
  });
});
