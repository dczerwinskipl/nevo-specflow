import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { deriveNevoMarkPalette, nevoMarkPaletteVariables, normalizeHue } from './palette';

const samplePrimary = '#2563eb';

describe('logo palette', () => {
  it('derives a deterministic seven-color palette from the active primary', () => {
    const first = deriveNevoMarkPalette({ coreColor: samplePrimary });
    const second = deriveNevoMarkPalette({ coreColor: samplePrimary });

    expect(first).toEqual(second);
    expect(Object.values(first)).toHaveLength(7);
    expect(Object.values(first).every((value) => /^#[\da-f]{6}$/i.test(value))).toBe(true);
  });

  it('normalizes hue in both directions', () => {
    expect(normalizeHue(-20)).toBe(340);
    expect(normalizeHue(380)).toBe(20);
  });

  it('gamut-maps extreme light and dark primary colors deterministically', () => {
    for (const primary of ['#000000', '#ffffff']) {
      const palette = deriveNevoMarkPalette({ coreColor: primary });
      expect(Object.values(palette).every((value) => /^#[\da-f]{6}$/i.test(value))).toBe(true);
      expect(palette).toEqual(deriveNevoMarkPalette({ coreColor: primary }));
    }
  });

  it('maps every derived color to a semantic logo variable', () => {
    const variables = nevoMarkPaletteVariables(deriveNevoMarkPalette({ coreColor: '#0f9f8f' }));

    expect(Object.keys(variables)).toEqual([
      '--nevo-mark-ribbon-start',
      '--nevo-mark-ribbon-mid',
      '--nevo-mark-ribbon-end',
      '--nevo-mark-back-start',
      '--nevo-mark-back-mid',
      '--nevo-mark-back-end',
      '--nevo-mark-shadow',
    ]);
  });

  it('keeps chromatic separation for teal while deriving each back from its ribbon stop', () => {
    expect(deriveNevoMarkPalette({ coreColor: '#0f9f8f' })).toEqual({
      ribbonStart: '#72c38f',
      ribbonMid: '#39b394',
      ribbonEnd: '#008d8a',
      backStart: '#5a9270',
      backMid: '#327b68',
      backEnd: '#0e6260',
      shadow: '#031613',
    });
  });

  it('uses core at the top and secondary at the bottom for two-color identities', () => {
    const palette = deriveNevoMarkPalette({
      coreColor: '#2b6bff',
      secondaryColor: '#21d7e8',
    });

    expect(palette.ribbonStart).toBe('#2b6bff');
    expect(palette.ribbonEnd).toBe('#21d7e8');
    expect(palette).toEqual(
      deriveNevoMarkPalette({
        coreColor: '#2b6bff',
        secondaryColor: '#21d7e8',
      }),
    );
  });

  it('keeps private mark paints out of global design-system tokens', async () => {
    const css = await readFile('src/design-system.css', 'utf8');
    const theme = await readFile('src/design-system/theme.ts', 'utf8');

    expect(css).not.toContain('--nevo-mark-');
    expect(css).not.toContain('--color-logo-');
    expect(theme).not.toContain('Color/logo-');
  });
});

